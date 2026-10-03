"""Step dispatch shared by the Modal deployment and the local worker server."""

from __future__ import annotations

import traceback
from typing import Any

# Resources per step, also used for cost accounting.
RESOURCES: dict[str, tuple[float, float]] = {
    "prepare": (2.0, 4.0),
    "transcribe": (0.25, 0.5),
    "detect": (0.25, 0.5),
    "render": (4.0, 8.0),
}

STEPS = tuple(RESOURCES)


def _job(payload: dict[str, Any]):
    from .pipeline import JobRef

    return JobRef(job_id=payload["job_id"], owner_id=payload["owner_id"],
                  user_id=payload.get("user_id"))


def messages_client():
    """Claude Messages client, or the dev-only fake when SEGMENTS_PROVIDER=fake."""
    import os

    if os.environ.get("SEGMENTS_PROVIDER", "claude") == "fake":
        from .devfakes import FakeMessages, assert_dev

        assert_dev("SEGMENTS_PROVIDER=fake")
        return FakeMessages()
    if not os.environ.get("ANTHROPIC_API_KEY"):
        from .pipeline import PipelineError

        raise PipelineError("claude_not_configured", "ANTHROPIC_API_KEY is not set")
    import anthropic

    return anthropic.Anthropic(max_retries=4).beta.messages


def execute(step: str, payload: dict[str, Any]) -> dict[str, Any]:
    from . import pipeline
    from .config import get_settings
    from .db import Database
    from .storage import R2

    settings = get_settings()
    res = pipeline.Resources(*RESOURCES[step])
    attempt = payload.get("attempt", 1)
    job = _job(payload)
    if step == "prepare":
        return pipeline.prepare(job, settings, R2(), Database(), res, attempt)
    if step == "transcribe":
        from .transcribe import get_provider

        return pipeline.transcribe(job, settings, R2(), Database(), get_provider(settings), res,
                                   attempt)
    if step == "detect":
        return pipeline.detect(job, settings, R2(), Database(), messages_client(), res, attempt)
    if step == "render":
        return pipeline.render(job, payload["segment_id"], payload.get("style", "impact"),
                               settings, R2(), Database(), res, attempt,
                               with_hook=payload.get("with_hook", True))
    raise ValueError(f"unknown step {step}")


def run_step(step: str, payload: dict[str, Any]) -> dict[str, Any]:
    """Run a step and turn expected failures into structured results."""
    from .pipeline import PipelineError

    try:
        return {"ok": True, "result": execute(step, payload)}
    except PipelineError as exc:
        return {"ok": False, "retryable": False, "code": exc.code, "message": str(exc),
                "details": exc.details}
    except Exception as exc:  # unexpected: let the orchestrator retry
        traceback.print_exc()
        return {"ok": False, "retryable": True, "code": "internal_error",
                "message": f"{type(exc).__name__}: {exc}"[:1000]}


def validate_payload(payload: dict[str, Any]) -> str | None:
    for key in ("job_id", "owner_id"):
        if not isinstance(payload.get(key), str):
            return f"missing {key}"
    return None
