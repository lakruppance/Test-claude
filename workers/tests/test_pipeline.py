"""Runs the four pipeline steps end to end on a synthetic video, with local fakes for R2,
Supabase, the transcription provider and Claude. Uses real FFmpeg."""

import json
import shutil
import subprocess
import uuid
from pathlib import Path
from types import SimpleNamespace

import pytest

from clipper import pipeline
from clipper.config import Settings
from clipper.models import Transcript, Word
from clipper.pipeline import JobRef, PipelineError, Resources

ROOT = Path(__file__).resolve().parents[1]
pytestmark = pytest.mark.skipif(
    shutil.which("ffmpeg") is None or not (ROOT / ".fonts").exists(),
    reason="ffmpeg or fonts missing",
)


class FakeR2:
    def __init__(self, root: Path):
        self.root = root

    def _p(self, key: str) -> Path:
        p = self.root / key
        p.parent.mkdir(parents=True, exist_ok=True)
        return p

    def download(self, key, dest):
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(self.root / key, dest)
        return dest

    def upload(self, src, key, content_type):
        shutil.copy(src, self._p(key))
        return src.stat().st_size

    def put_json(self, key, body):
        self._p(key).write_text(body)
        return len(body)

    def get_text(self, key):
        return (self.root / key).read_text()


class FakeDB:
    def __init__(self):
        self.tables: dict[str, list[dict]] = {}

    def insert(self, table, rows, upsert_on=None):
        rows = rows if isinstance(rows, list) else [rows]
        out = []
        for row in rows:
            row = {"id": row.get("id", str(uuid.uuid4())), **row}
            existing = self.tables.setdefault(table, [])
            if upsert_on:
                keys = upsert_on.split(",")
                existing[:] = [r for r in existing if any(r.get(k) != row.get(k) for k in keys)]
            existing.append(row)
            out.append(row)
        return out

    def delete(self, table, **filters):
        self.tables[table] = [
            r for r in self.tables.get(table, [])
            if any(str(r.get(k)) != v for k, v in filters.items())
        ]

    def select_one(self, table, **filters):
        for r in self.tables.get(table, []):
            if all(str(r.get(k)) == v for k, v in filters.items()):
                return r
        return None


class FakeProvider:
    def __init__(self, transcript):
        self.transcript = transcript

    def transcribe(self, audio, ledger):
        assert audio.exists() and audio.stat().st_size > 0
        ledger.transcription(self.transcript.duration)
        return self.transcript


class FakeMessages:
    def create(self, **kwargs):
        payload = {"candidates": [{
            "sentence_start": 1, "sentence_end": 4, "score_global": 86, "hook": 90,
            "autonomie": 80, "intensite": 75, "chute": 82, "justification": "Clear takeaway.",
            "titre_propose": "Le test qui marche", "accroche_ecran": "Ça marche vraiment",
        }]}
        return SimpleNamespace(
            model=kwargs["model"], stop_reason="end_turn",
            content=[SimpleNamespace(type="text", text=json.dumps(payload))],
            usage=SimpleNamespace(input_tokens=1200, output_tokens=400,
                                  cache_read_input_tokens=0, cache_creation_input_tokens=0),
        )


def synthetic_transcript(duration: float) -> Transcript:
    words, t, i = [], 0.5, 0
    while t < duration - 1:
        text = f"mot{i}" + ("." if i % 12 == 11 else "")
        words.append(Word(text=text, start=t, end=t + 0.3))
        t += 0.42
        i += 1
    return Transcript(language="fr", duration=duration, words=words)


@pytest.fixture
def env(tmp_path, monkeypatch):
    monkeypatch.setattr(pipeline, "FONTS_DIR", ROOT / ".fonts")
    monkeypatch.setattr(pipeline, "FACE_MODEL", ROOT / ".models" / "blaze_face_short_range.tflite")
    r2, db = FakeR2(tmp_path / "bucket"), FakeDB()
    job = JobRef(job_id=str(uuid.uuid4()), owner_id="anonymous", user_id=None)
    source_key = f"{job.prefix}/source.mp4"
    src = r2._p(source_key)
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i",
         "testsrc2=size=1280x720:rate=30:duration=40", "-f", "lavfi", "-i",
         "sine=frequency=300:duration=40", "-c:v", "libx264", "-preset", "ultrafast",
         "-c:a", "aac", "-shortest", str(src)],
        check=True,
    )
    db.insert("jobs", {"id": job.job_id, "source_key": source_key, "status": "running"})
    settings = Settings()
    object.__setattr__(settings, "clip_min_seconds", 10)
    object.__setattr__(settings, "clip_max_seconds", 30)
    return SimpleNamespace(r2=r2, db=db, job=job, settings=settings)


def test_full_pipeline_produces_clip_segments_json_and_costs(env):
    res = Resources(2, 4)
    prepared = pipeline.prepare(env.job, env.settings, env.r2, env.db, res)
    assert 39 < prepared["duration"] < 41

    transcript = synthetic_transcript(prepared["duration"])
    pipeline.transcribe(env.job, env.settings, env.r2, env.db, FakeProvider(transcript), res)
    assert env.db.select_one("transcripts", job_id=env.job.job_id)["language"] == "fr"

    detected = pipeline.detect(env.job, env.settings, env.r2, env.db, FakeMessages(), res)
    assert detected["segments"] == 1 and len(detected["to_render"]) == 1
    segments_json = json.loads(env.r2.get_text(f"{env.job.prefix}/segments.json"))
    assert set(segments_json[0]) >= {"start", "end", "score_global", "hook", "autonomie",
                                     "intensite", "chute", "justification", "titre_propose"}

    rendered = pipeline.render(env.job, detected["to_render"][0], "impact", env.settings,
                               env.r2, env.db, Resources(4, 8))
    assert rendered["reframe_mode"] == "blur"  # synthetic video has no face
    clip = env.db.tables["clips"][0]
    assert (clip["width"], clip["height"]) == (1080, 1920)
    assert (env.r2.root / clip["storage_key"]).stat().st_size > 10_000

    costs = env.db.tables["cost_events"]
    assert {c["provider"] for c in costs} == {"modal", "assemblyai", "anthropic", "r2"}
    assert all(c["usd"] >= 0 for c in costs)
    # Re-running detect is idempotent (no duplicated segments)
    pipeline.detect(env.job, env.settings, env.r2, env.db, FakeMessages(), res)
    assert len(env.db.tables["segments"]) == 1


def test_source_too_long_is_a_clear_non_retryable_error(env):
    object.__setattr__(env.settings, "max_source_minutes", 0.5)
    with pytest.raises(PipelineError) as err:
        pipeline.prepare(env.job, env.settings, env.r2, env.db, Resources(2, 4))
    assert err.value.code == "source_too_long"
