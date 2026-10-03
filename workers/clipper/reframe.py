"""Vertical reframing: track the speaker's face with MediaPipe and derive a smooth crop path.
Falls back to a blurred-background layout when no face is reliably detected."""

from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass
from pathlib import Path

import numpy as np

SAMPLE_FPS = 4
DETECT_WIDTH = 960
MIN_DETECTION_RATE = 0.35  # below this share of sampled frames with a face -> blur fallback
DEAD_ZONE = 0.07  # fraction of frame width the face may drift before the camera follows
EASE = 0.3  # per-sample easing toward the target once the camera moves


@dataclass(frozen=True)
class VideoInfo:
    width: int
    height: int
    fps: float
    duration: float
    has_audio: bool


@dataclass(frozen=True)
class CropPlan:
    mode: str  # "track" | "blur" | "vertical"
    crop_width: int
    crop_height: int
    times: list[float]  # seconds, relative to clip start
    xs: list[int]  # crop x offset (pixels) at each time
    detection_rate: float


def probe(path: str | Path) -> VideoInfo:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)],
        check=True, capture_output=True, text=True,
    ).stdout
    data = json.loads(out)
    video = next(s for s in data["streams"] if s["codec_type"] == "video")
    has_audio = any(s["codec_type"] == "audio" for s in data["streams"])
    num, den = (video.get("avg_frame_rate") or "30/1").split("/")
    fps = float(num) / float(den) if float(den) else 30.0
    width, height = int(video["width"]), int(video["height"])
    # Respect rotation metadata (phone footage).
    rotation = 0
    for side in video.get("side_data_list", []) or []:
        if "rotation" in side:
            rotation = abs(int(side["rotation"]))
    if rotation in (90, 270):
        width, height = height, width
    return VideoInfo(width, height, fps, float(data["format"]["duration"]), has_audio)


def probe_duration(path: str | Path) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0",
         str(path)],
        check=True, capture_output=True, text=True,
    ).stdout
    return float(out.strip())


def sample_frames(path: str | Path, start: float, end: float, info: VideoInfo):
    """Yield (t_relative, rgb ndarray) at SAMPLE_FPS, downscaled for detection."""
    w = DETECT_WIDTH if info.width > DETECT_WIDTH else info.width - info.width % 2
    h = int(round(info.height * w / info.width / 2)) * 2
    proc = subprocess.Popen(
        [
            "ffmpeg", "-v", "error", "-ss", f"{start:.3f}", "-to", f"{end:.3f}", "-i", str(path),
            "-vf", f"fps={SAMPLE_FPS},scale={w}:{h}", "-f", "rawvideo", "-pix_fmt", "rgb24", "-",
        ],
        stdout=subprocess.PIPE,
    )
    frame_bytes = w * h * 3
    i = 0
    assert proc.stdout is not None
    try:
        while True:
            buf = proc.stdout.read(frame_bytes)
            if len(buf) < frame_bytes:
                break
            yield i / SAMPLE_FPS, np.frombuffer(buf, np.uint8).reshape(h, w, 3)
            i += 1
    finally:
        proc.stdout.close()
        proc.wait()


class FaceDetector:
    def __init__(self, model_path: str | Path):
        from mediapipe.tasks.python import BaseOptions
        from mediapipe.tasks.python.vision import FaceDetector as MPFaceDetector
        from mediapipe.tasks.python.vision import FaceDetectorOptions

        self._detector = MPFaceDetector.create_from_options(
            FaceDetectorOptions(
                base_options=BaseOptions(model_asset_path=str(model_path)),
                min_detection_confidence=0.5,
            )
        )

    def faces(self, rgb: np.ndarray) -> list[tuple[float, float]]:
        """Return (center_x normalized, area normalized) for each detected face."""
        import mediapipe as mp

        image = mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb))
        result = self._detector.detect(image)
        h, w = rgb.shape[:2]
        found = []
        for det in result.detections:
            box = det.bounding_box
            cx = (box.origin_x + box.width / 2) / w
            found.append((min(max(cx, 0.0), 1.0), box.width * box.height / (w * h)))
        return found

    def close(self) -> None:
        self._detector.close()


def pick_face(faces: list[tuple[float, float]], previous: float | None) -> float | None:
    """Prefer the largest face, but stay on the current subject when it is nearly as large
    (avoids ping-ponging between two speakers of similar size)."""
    if not faces:
        return None
    largest = max(faces, key=lambda f: f[1])
    if previous is not None:
        near = min(faces, key=lambda f: abs(f[0] - previous))
        if near[1] >= 0.7 * largest[1]:
            return near[0]
    return largest[0]


def smooth_path(raw: list[float | None]) -> list[float]:
    """Fill gaps, remove jitter (median), then move the virtual camera only when the subject
    leaves a dead zone, easing toward it."""
    if not raw or all(v is None for v in raw):
        return [0.5] * len(raw)
    filled: list[float] = []
    last = next(v for v in raw if v is not None)
    for v in raw:
        last = v if v is not None else last
        filled.append(last)
    arr = np.array(filled)
    k = 2
    med = np.array([np.median(arr[max(0, i - k) : i + k + 1]) for i in range(len(arr))])
    out: list[float] = []
    cam = float(med[0])
    target = cam
    for v in med:
        if abs(v - target) > DEAD_ZONE:
            target = float(v)
        cam += (target - cam) * EASE
        out.append(cam)
    return out


def plan_crop(
    path: str | Path,
    start: float,
    end: float,
    info: VideoInfo,
    detector: FaceDetector | None,
) -> CropPlan:
    crop_h = info.height - info.height % 2
    crop_w = int(crop_h * 9 / 16) // 2 * 2
    if info.width <= crop_w or info.width / info.height <= 9 / 16 + 0.02:
        return CropPlan("vertical", info.width, info.height, [0.0], [0], 1.0)
    if detector is None:
        return CropPlan("blur", crop_w, crop_h, [0.0], [0], 0.0)

    times: list[float] = []
    raw: list[float | None] = []
    previous: float | None = None
    for t, frame in sample_frames(path, start, end, info):
        cx = pick_face(detector.faces(frame), previous)
        previous = cx if cx is not None else previous
        times.append(t)
        raw.append(cx)
    rate = sum(v is not None for v in raw) / len(raw) if raw else 0.0
    if rate < MIN_DETECTION_RATE:
        return CropPlan("blur", crop_w, crop_h, [0.0], [0], rate)
    centers = smooth_path(raw)
    max_x = info.width - crop_w
    xs = [int(min(max(c * info.width - crop_w / 2, 0), max_x)) for c in centers]
    return CropPlan("track", crop_w, crop_h, times, xs, rate)


def sendcmd_script(plan: CropPlan, duration: float, fps: float = 30.0) -> str:
    """Per-frame crop x commands, linearly interpolated between samples, for FFmpeg sendcmd."""
    if not plan.times:
        return ""
    lines = []
    n = int(duration * fps) + 1
    times = np.array(plan.times)
    xs = np.array(plan.xs, dtype=float)
    prev = None
    for i in range(n):
        t = i / fps
        x = int(np.interp(t, times, xs)) // 2 * 2
        if x != prev:
            lines.append(f"{t:.4f} crop x {x};")
            prev = x
    return "\n".join(lines) + "\n"
