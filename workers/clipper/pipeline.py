"""Pipeline steps. Each step is idempotent: re-running it for the same job overwrites its own
outputs, so the orchestrator can retry safely. Costs of every attempt are recorded."""

from __future__ import annotations

import json
import os
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .config import Settings
from .costs import CostLedger
from .models import Segment, Transcript

ASSETS_DIR = Path(os.environ.get("CLIPPER_ASSETS_DIR", "/assets"))
FONTS_DIR = ASSETS_DIR / "fonts"
FACE_MODEL = ASSETS_DIR / "models" / "blaze_face_short_range.tflite"


class PipelineError(Exception):
    """An expected failure with a stable code the UI can translate. Not retryable."""

    def __init__(self, code: str, message: str, details: dict[str, Any] | None = None):
        super().__init__(message)
        self.code = code
        self.details = details or {}


@dataclass
class JobRef:
    job_id: str
    owner_id: str  # user id, or "anonymous" for staging jobs without auth
    user_id: str | None  # value written to user_id columns

    @property
    def sources(self) -> str:
        from .storage import source_prefix

        return source_prefix(self.owner_id, self.job_id)

    @property
    def outputs(self) -> str:
        from .storage import output_prefix

        return output_prefix(self.owner_id, self.job_id)


@dataclass
class Resources:
    cores: float
    memory_gib: float


def _record_costs(db, job: JobRef, step: str, ledger: CostLedger, attempt: int) -> float:
    rows = []
    for row in ledger.to_rows():
        row["meta"] = {**row["meta"], "attempt": attempt}
        rows.append({"job_id": job.job_id, "user_id": job.user_id, "step": step, **row})
    if rows:
        db.insert("cost_events", rows)
    return ledger.total_usd


def prepare(job: JobRef, settings: Settings, r2, db, resources: Resources,
            attempt: int = 1) -> dict[str, Any]:
    """Download the source, validate it and extract a speech-optimized audio track."""
    from .reframe import probe
    from .render import extract_audio

    started = time.monotonic()
    ledger = CostLedger(settings.prices)
    job_row = db.select_one("jobs", id=job.job_id)
    if job_row is None:
        raise PipelineError("job_not_found", f"Job {job.job_id} not found")
    with tempfile.TemporaryDirectory() as tmp:
        source = r2.download(job_row["source_key"], Path(tmp) / "source")
        try:
            info = probe(source)
        except Exception as exc:
            raise PipelineError("unreadable_source", "The file is not a readable video") from exc
        if info.duration > settings.max_source_minutes * 60:
            raise PipelineError(
                "source_too_long",
                "The video exceeds the maximum duration for this plan",
                {"duration": info.duration, "max_minutes": settings.max_source_minutes},
            )
        if not info.has_audio:
            raise PipelineError("no_audio", "The video has no audio track")
        audio = Path(tmp) / "audio.mp3"
        extract_audio(source, audio)
        size = r2.upload(audio, f"{job.sources}/audio.mp3", "audio/mpeg")
        ledger.storage("audio", size, 7)
    ledger.compute("prepare", time.monotonic() - started, resources.cores, resources.memory_gib)
    cost = _record_costs(db, job, "prepare", ledger, attempt)
    return {"duration": info.duration, "width": info.width, "height": info.height,
            "fps": info.fps, "cost_usd": cost}


def transcribe(job: JobRef, settings: Settings, r2, db, provider, resources: Resources,
               attempt: int = 1) -> dict[str, Any]:
    started = time.monotonic()
    ledger = CostLedger(settings.prices)
    with tempfile.TemporaryDirectory() as tmp:
        audio = r2.download(f"{job.sources}/audio.mp3", Path(tmp) / "audio.mp3")
        transcript = provider.transcribe(audio, ledger)
    if len(transcript.words) < 20:
        _record_costs(db, job, "transcribe", ledger, attempt)
        raise PipelineError("no_speech", "Not enough speech was detected in this video")
    r2.put_json(f"{job.outputs}/transcript.json", transcript.model_dump_json())
    db.insert(
        "transcripts",
        {
            "job_id": job.job_id,
            "user_id": job.user_id,
            "language": transcript.language,
            "duration_seconds": transcript.duration,
            "source": transcript.source,
            "words": [w.model_dump() for w in transcript.words],
        },
        upsert_on="job_id",
    )
    ledger.compute("transcribe", time.monotonic() - started, resources.cores, resources.memory_gib)
    cost = _record_costs(db, job, "transcribe", ledger, attempt)
    return {"language": transcript.language, "words": len(transcript.words), "cost_usd": cost}


def detect(job: JobRef, settings: Settings, r2, db, messages, resources: Resources,
           attempt: int = 1) -> dict[str, Any]:
    from . import metadata
    from .segments import detect_segments

    started = time.monotonic()
    ledger = CostLedger(settings.prices)
    transcript = Transcript.model_validate_json(r2.get_text(f"{job.outputs}/transcript.json"))
    platform_meta: dict[int, dict[str, Any]] = {}
    try:
        segments = detect_segments(messages, transcript, settings, ledger)
        platform_meta = metadata.generate(messages, settings, ledger, segments,
                                          transcript.language)
    finally:
        ledger.compute("detect", time.monotonic() - started, resources.cores, resources.memory_gib)
        cost = _record_costs(db, job, "detect", ledger, attempt)
    if not segments:
        raise PipelineError("no_segments", "No passage met the clip quality rules")

    payload = [s.model_dump(exclude={"sentence_start", "sentence_end"}) for s in segments]
    r2.put_json(f"{job.outputs}/segments.json", json.dumps(payload, ensure_ascii=False, indent=2))
    db.delete("segments", job_id=job.job_id)  # idempotent re-run (cascades to clips)
    rows = db.insert(
        "segments",
        [
            {
                "job_id": job.job_id,
                "user_id": job.user_id,
                "rank": rank,
                "start_seconds": s.start,
                "end_seconds": s.end,
                "original_start_seconds": s.start,
                "original_end_seconds": s.end,
                "platform_meta": platform_meta.get(rank, {}),
                "score_global": s.score_global,
                "hook": s.hook,
                "autonomie": s.autonomie,
                "intensite": s.intensite,
                "chute": s.chute,
                "justification": s.justification,
                "titre_propose": s.titre_propose,
                "accroche_ecran": s.accroche_ecran,
                "transcript_text": s.text,
                "sentence_start": s.sentence_start,
                "sentence_end": s.sentence_end,
            }
            for rank, s in enumerate(segments, start=1)
        ],
    )
    to_render = sorted(rows, key=lambda r: r["rank"])[: settings.clips_to_render]
    return {
        "segments": len(rows),
        "to_render": [r["id"] for r in to_render],
        "cost_usd": cost,
    }


def render(job: JobRef, segment_id: str, style: str, settings: Settings, r2, db,
           resources: Resources, attempt: int = 1, with_hook: bool = True,
           clip_id: str | None = None, watermark: bool = True) -> dict[str, Any]:
    """Renders a segment. With clip_id, re-renders that existing clip (new bounds or style)."""
    from .reframe import FaceDetector, plan_crop, probe
    from .render import render_clip, thumbnail
    from .subtitles import STYLES, build_ass

    if style not in STYLES:
        raise PipelineError("invalid_style", f"Unknown caption style: {style}")
    started = time.monotonic()
    ledger = CostLedger(settings.prices)
    seg_row = db.select_one("segments", id=segment_id, job_id=job.job_id)
    if seg_row is None:
        raise PipelineError("segment_not_found", "Segment not found for this job")
    segment = Segment(
        start=float(seg_row["start_seconds"]), end=float(seg_row["end_seconds"]),
        score_global=seg_row["score_global"], hook=seg_row["hook"],
        autonomie=seg_row["autonomie"], intensite=seg_row["intensite"], chute=seg_row["chute"],
        justification=seg_row["justification"], titre_propose=seg_row["titre_propose"],
        accroche_ecran=seg_row["accroche_ecran"], sentence_start=seg_row["sentence_start"],
        sentence_end=seg_row["sentence_end"],
    )
    job_row = db.select_one("jobs", id=job.job_id)
    transcript = Transcript.model_validate_json(r2.get_text(f"{job.outputs}/transcript.json"))

    with tempfile.TemporaryDirectory() as tmp:
        tmpdir = Path(tmp)
        try:
            source = r2.download(job_row["source_key"], tmpdir / "source")
        except Exception as exc:
            if "404" in str(exc) or "NoSuchKey" in str(exc) or "Not Found" in str(exc):
                raise PipelineError("source_expired",
                                    "The source video was deleted after its retention period"
                                    ) from exc
            raise
        info = probe(source)
        detector = FaceDetector(FACE_MODEL) if FACE_MODEL.exists() else None
        try:
            plan = plan_crop(source, segment.start, segment.end, info, detector)
        finally:
            if detector:
                detector.close()
        ass = build_ass(transcript.words, segment.start, segment.end, style,
                        hook_text=segment.accroche_ecran if with_hook else "")
        out = tmpdir / f"clip-{seg_row['rank']:02d}-{style}.mp4"
        render_clip(source, out, segment.start, segment.end, info, plan, ass, FONTS_DIR, tmpdir,
                    watermark=settings.watermark_text if watermark else None)
        thumb = tmpdir / "thumb.jpg"
        thumbnail(out, thumb)
        version = int(time.time())
        clip_key = f"{job.outputs}/clips/{seg_row['rank']:02d}-{style}-{version}.mp4"
        thumb_key = f"{job.outputs}/clips/{seg_row['rank']:02d}-{style}-{version}.jpg"
        size = r2.upload(out, clip_key, "video/mp4")
        r2.upload(thumb, thumb_key, "image/jpeg")
        rendered = probe(out)
    ledger.storage("clip", size, 90)
    clip_row = {
        "job_id": job.job_id,
        "segment_id": segment_id,
        "user_id": job.user_id,
        "style": style,
        "with_hook": with_hook,
        "watermarked": watermark,
        "reframe_mode": plan.mode,
        "storage_key": clip_key,
        "thumbnail_key": thumb_key,
        "width": rendered.width,
        "height": rendered.height,
        "duration_seconds": rendered.duration,
        "bytes": size,
        "status": "pending_review",
        "render_error": None,
    }
    if clip_id:
        db.update("clips", clip_row, id=clip_id, job_id=job.job_id)
    else:
        db.insert("clips", clip_row, upsert_on="segment_id,style")
    ledger.compute("render", time.monotonic() - started, resources.cores, resources.memory_gib)
    cost = _record_costs(db, job, "render", ledger, attempt)
    return {"segment_id": segment_id, "storage_key": clip_key, "reframe_mode": plan.mode,
            "detection_rate": round(plan.detection_rate, 3), "cost_usd": cost}


def fetch(job: JobRef, settings: Settings, r2, db, resources: Resources, attempt: int = 1,
          max_bytes: int | None = None, ydl_factory=None) -> dict[str, Any]:
    """Download a linked source (Drive, Dropbox, YouTube) into object storage."""
    from .ingest import (
        detect_kind,
        download_http,
        download_youtube,
        drive_download_url,
        dropbox_download_url,
    )

    started = time.monotonic()
    ledger = CostLedger(settings.prices)
    job_row = db.select_one("jobs", id=job.job_id)
    if job_row is None:
        raise PipelineError("job_not_found", f"Job {job.job_id} not found")
    url = job_row.get("source_url") or ""
    kind = detect_kind(url)
    max_bytes = max_bytes or int(os.environ.get("MAX_UPLOAD_BYTES", 5 * 1024**3))
    title = None
    with tempfile.TemporaryDirectory() as tmp:
        tmpdir = Path(tmp)
        if kind == "youtube":
            path, meta = download_youtube(url, tmpdir, settings.max_source_minutes, max_bytes,
                                          ydl_factory=ydl_factory)
            title = meta["title"]
        else:
            path = tmpdir / "source"
            download_url = drive_download_url(url) if kind == "drive" else dropbox_download_url(url)
            _, title = download_http(download_url, path, max_bytes)
        size = r2.upload(path, job_row["source_key"], "video/mp4")
    ledger.storage("source", size, 7)
    ledger.compute("fetch", time.monotonic() - started, resources.cores, resources.memory_gib)
    cost = _record_costs(db, job, "fetch", ledger, attempt)
    return {"bytes": size, "title": title, "kind": kind, "cost_usd": cost}
