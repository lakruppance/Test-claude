"""Per-platform publishing metadata (YouTube Shorts title/description, TikTok caption, hashtags)
written by the light Claude model for every selected segment, in one request."""

from __future__ import annotations

import json
from typing import Any

from .config import Settings
from .costs import CostLedger
from .models import Segment

META_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "rank": {"type": "integer"},
                    "youtube": {
                        "type": "object",
                        "properties": {
                            "title": {"type": "string"},
                            "description": {"type": "string"},
                            "hashtags": {"type": "array", "items": {"type": "string"}},
                        },
                        "required": ["title", "description", "hashtags"],
                        "additionalProperties": False,
                    },
                    "tiktok": {
                        "type": "object",
                        "properties": {
                            "caption": {"type": "string"},
                            "hashtags": {"type": "array", "items": {"type": "string"}},
                        },
                        "required": ["caption", "hashtags"],
                        "additionalProperties": False,
                    },
                },
                "required": ["rank", "youtube", "tiktok"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["items"],
    "additionalProperties": False,
}

SYSTEM = """You write publishing metadata for short vertical video clips, in the clip's language \
({language}).
For each clip:
- youtube.title: max 90 characters, specific, no clickbait, no emojis.
- youtube.description: 1 to 3 short sentences that summarize the clip.
- youtube.hashtags: 3 to 5 relevant hashtags, the first one being #shorts.
- tiktok.caption: max 150 characters, conversational, may end with a question.
- tiktok.hashtags: 3 to 6 relevant hashtags.
Hashtags start with # and contain no spaces. Do not invent facts that are not in the clip."""


def _clean_tags(tags: list[str], limit: int) -> list[str]:
    out: list[str] = []
    for tag in tags:
        tag = "#" + "".join(ch for ch in tag.lstrip("#") if ch.isalnum() or ch == "_")
        if len(tag) > 1 and tag.lower() not in {t.lower() for t in out}:
            out.append(tag[:40])
    return out[:limit]


def generate(messages, settings: Settings, ledger: CostLedger, segments: list[Segment],
             language: str) -> dict[int, dict[str, Any]]:
    """Returns {rank: {"youtube": {...}, "tiktok": {...}}}. Never raises: metadata is optional."""
    if not segments:
        return {}
    clips = "\n\n".join(
        f"[clip {rank}] Proposed title: {s.titre_propose}\nTranscript: {s.text[:1500]}"
        for rank, s in enumerate(segments, start=1)
    )
    try:
        response = messages.create(
            model=settings.claude_model_light,
            max_tokens=8000,
            system=SYSTEM.format(language=language),
            messages=[{"role": "user", "content": clips}],
            output_config={"format": {"type": "json_schema", "schema": META_SCHEMA}},
        )
        ledger.claude("metadata", getattr(response, "model", settings.claude_model_light),
                      response.usage)
        if response.stop_reason != "end_turn":
            return {}
        text = next((b.text for b in response.content if b.type == "text"), "")
        items = json.loads(text).get("items", [])
    except Exception:  # metadata must never fail the job
        return {}
    result: dict[int, dict[str, Any]] = {}
    for item in items:
        yt, tt = item.get("youtube", {}), item.get("tiktok", {})
        result[int(item.get("rank", 0))] = {
            "youtube": {
                "title": str(yt.get("title", ""))[:100],
                "description": str(yt.get("description", ""))[:1000],
                "hashtags": _clean_tags(yt.get("hashtags", []), 5),
            },
            "tiktok": {
                "caption": str(tt.get("caption", ""))[:300],
                "hashtags": _clean_tags(tt.get("hashtags", []), 6),
            },
        }
    return result
