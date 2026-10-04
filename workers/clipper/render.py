"""FFmpeg rendering of a 1080x1920 H.264 + AAC clip with burned-in subtitles."""

from __future__ import annotations

import subprocess
from pathlib import Path

from .reframe import CropPlan, VideoInfo, sendcmd_script

OUT_W, OUT_H, OUT_FPS = 1080, 1920, 30


def _filter_escape(path: str | Path) -> str:
    # Paths inside a filtergraph: escape the characters FFmpeg treats specially.
    return str(path).replace("\\", "/").replace(":", "\\:").replace("'", "\\'")


WATERMARK_FONT = "Poppins-Bold.ttf"


def _text_escape(text: str) -> str:
    # drawtext text value inside a quoted filter argument.
    return text.replace("\\", "\\\\").replace("'", "\u2019").replace(":", "\\:").replace("%", "\\%")


def watermark_filter(text: str, fonts_dir: Path) -> str:
    """Free-plan watermark: right-aligned, under the hook line and clear of the caption zone,
    semi-transparent with a soft shadow so it reads on any background."""
    font = _filter_escape(fonts_dir / WATERMARK_FONT)
    return (
        f"drawtext=fontfile='{font}':text='{_text_escape(text)}':fontsize=44:"
        "fontcolor=white@0.72:shadowcolor=black@0.45:shadowx=2:shadowy=2:"
        "x=w-tw-56:y=h*0.215"
    )


def build_filtergraph(plan: CropPlan, ass_path: Path, fonts_dir: Path, cmd_path: Path,
                      watermark: str | None = None) -> str:
    subs = f"ass=filename='{_filter_escape(ass_path)}':fontsdir='{_filter_escape(fonts_dir)}'"
    mark = f",{watermark_filter(watermark, fonts_dir)}" if watermark else ""
    tail = f"setsar=1,fps={OUT_FPS},{subs}{mark},format=yuv420p[v]"
    if plan.mode == "track":
        x0 = plan.xs[0] if plan.xs else 0
        return (
            f"[0:v]sendcmd=f='{_filter_escape(cmd_path)}',"
            f"crop=w={plan.crop_width}:h={plan.crop_height}:x={x0}:y=0,"
            f"scale={OUT_W}:{OUT_H}:flags=lanczos,{tail}"
        )
    # "blur" (landscape, no reliable face) and "vertical" (already portrait): fit the frame
    # over a blurred, darkened fill of itself.
    return (
        "[0:v]split=2[bgsrc][fgsrc];"
        f"[bgsrc]scale={OUT_W}:{OUT_H}:force_original_aspect_ratio=increase,"
        f"crop={OUT_W}:{OUT_H},gblur=sigma=40,eq=brightness=-0.12[bg];"
        f"[fgsrc]scale={OUT_W}:{OUT_H}:force_original_aspect_ratio=decrease:flags=lanczos[fg];"
        f"[bg][fg]overlay=(W-w)/2:(H-h)/2,{tail}"
    )


def render_clip(
    source: Path,
    out_path: Path,
    start: float,
    end: float,
    info: VideoInfo,
    plan: CropPlan,
    ass_text: str,
    fonts_dir: Path,
    workdir: Path,
    preset: str = "medium",
    watermark: str | None = None,
) -> None:
    workdir.mkdir(parents=True, exist_ok=True)
    ass_path = workdir / f"{out_path.stem}.ass"
    ass_path.write_text(ass_text, encoding="utf-8")
    cmd_path = workdir / f"{out_path.stem}.cmd"
    cmd_path.write_text(sendcmd_script(plan, end - start, OUT_FPS) if plan.mode == "track" else "")

    graph = build_filtergraph(plan, ass_path, fonts_dir, cmd_path, watermark)
    args = [
        "ffmpeg", "-y", "-v", "error",
        "-ss", f"{start:.3f}", "-to", f"{end:.3f}", "-i", str(source),
        "-filter_complex", graph, "-map", "[v]",
    ]
    if info.has_audio:
        args += [
            "-map", "0:a:0", "-af", "loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000",
            "-c:a", "aac", "-b:a", "160k", "-ac", "2",
        ]
    args += [
        "-c:v", "libx264", "-preset", preset, "-crf", "20", "-profile:v", "high",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-shortest", str(out_path),
    ]
    result = subprocess.run(args, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg failed: {result.stderr[-2000:]}")


def extract_audio(source: Path, out_path: Path) -> None:
    """Mono 16 kHz MP3 for transcription: small upload, no quality loss for speech."""
    result = subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-i", str(source), "-vn", "-ac", "1", "-ar", "16000",
         "-c:a", "libmp3lame", "-b:a", "64k", str(out_path)],
        capture_output=True, text=True, check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(f"audio extraction failed: {result.stderr[-2000:]}")


def thumbnail(clip: Path, out_path: Path, at: float = 1.0) -> None:
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-ss", f"{at:.2f}", "-i", str(clip), "-frames:v", "1",
         "-vf", "scale=540:-2", "-q:v", "4", str(out_path)],
        check=True, capture_output=True,
    )
