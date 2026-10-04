"""Render tests run real FFmpeg on a synthetic video. They need ffmpeg with libass and the fonts
downloaded by scripts/fetch_assets.sh (skipped otherwise)."""

import shutil
import subprocess
from pathlib import Path

import pytest

from clipper.models import Word
from clipper.reframe import CropPlan, pick_face, plan_crop, probe, sendcmd_script, smooth_path
from clipper.render import render_clip
from clipper.subtitles import STYLES, build_ass, group_words

ROOT = Path(__file__).resolve().parents[1]
FONTS = ROOT / ".fonts"

needs_ffmpeg = pytest.mark.skipif(
    shutil.which("ffmpeg") is None or not FONTS.exists(), reason="ffmpeg or fonts missing"
)


@pytest.fixture(scope="session")
def landscape(tmp_path_factory) -> Path:
    path = tmp_path_factory.mktemp("media") / "landscape.mp4"
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i",
         "testsrc2=size=1280x720:rate=30:duration=8", "-f", "lavfi", "-i",
         "sine=frequency=440:duration=8", "-c:v", "libx264", "-preset", "ultrafast",
         "-c:a", "aac", "-shortest", str(path)],
        check=True,
    )
    return path


def words() -> list[Word]:
    tokens = "Voici une phrase de test, avec des mots synchronisés. Et une deuxième!".split()
    return [Word(text=w, start=1 + i * 0.4, end=1 + i * 0.4 + 0.3) for i, w in enumerate(tokens)]


def test_group_words_respects_limits_and_punctuation():
    groups = group_words(words(), max_words=3, max_chars=18)
    assert all(len(g) <= 3 for g in groups)
    assert groups[1][-1].text == "test,"


def test_ass_contains_one_event_per_word_and_hook():
    ass = build_ass(words(), clip_start=0.5, clip_end=7, style_key="impact", hook_text="Le hook")
    events = [line for line in ass.splitlines() if line.startswith("Dialogue: 0")]
    assert len(events) == len(words())
    assert "Le hook" in ass and "VOICI" in ass
    assert "{" not in "".join(w.text for w in words())


def test_smoothing_ignores_jitter_and_follows_real_moves():
    jitter = [0.5, 0.52, 0.48, 0.51, 0.49] * 4
    path = smooth_path(jitter)
    assert max(path) - min(path) < 0.02
    moved = smooth_path([0.3] * 10 + [0.7] * 20)
    assert moved[0] < 0.35 and moved[-1] > 0.65
    gaps = smooth_path([None, 0.4, None, None, 0.4])
    assert all(abs(v - 0.4) < 1e-6 for v in gaps)


def test_pick_face_sticks_to_current_speaker_of_similar_size():
    faces = [(0.2, 0.05), (0.8, 0.06)]
    assert pick_face(faces, previous=0.21) == 0.2
    assert pick_face(faces, previous=None) == 0.8
    assert pick_face([(0.2, 0.01), (0.8, 0.06)], previous=0.21) == 0.8


def test_sendcmd_interpolates_even_offsets():
    plan = CropPlan("track", 404, 720, [0.0, 1.0], [0, 100], 1.0)
    script = sendcmd_script(plan, 1.0, fps=10)
    xs = [int(line.split()[-1].rstrip(";")) for line in script.splitlines()]
    assert xs[0] == 0 and xs[-1] == 100 and all(x % 2 == 0 for x in xs)


@needs_ffmpeg
@pytest.mark.parametrize("mode", ["blur", "track"])
@pytest.mark.parametrize("style", sorted(STYLES))
def test_render_produces_vertical_h264_aac(landscape, tmp_path, mode, style):
    info = probe(landscape)
    if mode == "blur":
        plan = plan_crop(landscape, 1, 6, info, detector=None)
        assert plan.mode == "blur"
    else:
        plan = CropPlan("track", 404, 720, [0.0, 2.5, 5.0], [0, 400, 876], 1.0)
    out = tmp_path / f"clip-{mode}-{style}.mp4"
    ass = build_ass(words(), 1, 6, style, hook_text="Accroche test")
    render_clip(landscape, out, 1, 6, info, plan, ass, FONTS, tmp_path, preset="ultrafast")
    rendered = probe(out)
    assert (rendered.width, rendered.height) == (1080, 1920)
    assert rendered.has_audio
    assert 4.8 <= rendered.duration <= 5.3
    codecs = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "stream=codec_name", "-of", "csv=p=0",
         str(out)], capture_output=True, text=True, check=True,
    ).stdout.split()
    assert codecs == ["h264", "aac"]


def _region(clip: Path, x: int, y: int, w: int, h: int) -> bytes:
    return subprocess.run(
        ["ffmpeg", "-v", "error", "-ss", "2", "-i", str(clip), "-frames:v", "1",
         "-vf", f"crop={w}:{h}:{x}:{y},format=gray", "-f", "rawvideo", "-"],
        capture_output=True, check=True,
    ).stdout


@needs_ffmpeg
def test_free_plan_watermark_is_burned_in_only_when_requested(landscape, tmp_path):
    info = probe(landscape)
    plan = plan_crop(landscape, 1, 4, info, detector=None)
    ass = build_ass(words(), 1, 4, "impact", hook_text="")
    plain, marked = tmp_path / "plain.mp4", tmp_path / "marked.mp4"
    render_clip(landscape, plain, 1, 4, info, plan, ass, FONTS, tmp_path, preset="ultrafast")
    render_clip(landscape, marked, 1, 4, info, plan, ass, FONTS, tmp_path, preset="ultrafast",
                watermark="Fait avec Pépite : l'outil")
    # Watermark area (right side, ~21% from the top) differs; an area far from it does not.
    zone = (560, 400, 470, 70)
    a, b = _region(plain, *zone), _region(marked, *zone)
    assert sum(abs(x - y) for x, y in zip(a, b, strict=True)) / len(a) > 4
    far = (40, 1500, 300, 60)
    c, d = _region(plain, *far), _region(marked, *far)
    assert sum(abs(x - y) for x, y in zip(c, d, strict=True)) / len(c) < 1.5
