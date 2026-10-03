"""Best-segment detection: Claude scores candidate clips per transcript window, then code enforces
the editorial rules (sentence boundaries, duration, no orphan references, no overlap)."""

from __future__ import annotations

import json
import re
from typing import Any, Protocol

from pydantic import BaseModel, Field, ValidationError

from .config import Settings
from .costs import CostLedger
from .models import Segment, Sentence, Transcript
from .transcript import build_sentences, windows

# Openers that point to earlier context; a clip must never start with them.
ORPHAN_PATTERNS = [
    r"\bcomme (je|on) (le )?(disais|l'?ai dit|a dit|a vu|expliquais)\b",
    r"\btout à l'heure\b",
    r"\bje (le )?répète\b",
    r"\bcomme mentionné\b",
    r"\b(as|like) i (said|mentioned|was saying)\b",
    r"\bas (we|you) (saw|discussed|heard)\b",
    r"\bearlier i\b",
    r"\b(going|coming) back to (that|what)\b",
]
ORPHAN_RE = re.compile("|".join(ORPHAN_PATTERNS), re.IGNORECASE)

# Seconds of air added around the spoken words.
LEAD_IN = 0.15
TAIL_OUT = 0.35


class Candidate(BaseModel):
    """What Claude returns for one candidate (sentence indices, not timestamps)."""

    sentence_start: int
    sentence_end: int
    score_global: int = Field(ge=0, le=100)
    hook: int = Field(ge=0, le=100)
    autonomie: int = Field(ge=0, le=100)
    intensite: int = Field(ge=0, le=100)
    chute: int = Field(ge=0, le=100)
    justification: str
    titre_propose: str
    accroche_ecran: str


_SCORE = {"type": "integer", "minimum": 0, "maximum": 100}
CANDIDATES_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "candidates": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "sentence_start": {"type": "integer"},
                    "sentence_end": {"type": "integer"},
                    "score_global": _SCORE,
                    "hook": _SCORE,
                    "autonomie": _SCORE,
                    "intensite": _SCORE,
                    "chute": _SCORE,
                    "justification": {"type": "string"},
                    "titre_propose": {"type": "string"},
                    "accroche_ecran": {"type": "string"},
                },
                "required": [
                    "sentence_start",
                    "sentence_end",
                    "score_global",
                    "hook",
                    "autonomie",
                    "intensite",
                    "chute",
                    "justification",
                    "titre_propose",
                    "accroche_ecran",
                ],
                "additionalProperties": False,
            },
        }
    },
    "required": ["candidates"],
    "additionalProperties": False,
}

SYSTEM_PROMPT = """You are a senior short-form video editor. You select passages from a long video \
transcript that will work as standalone vertical clips on TikTok and YouTube Shorts.

The transcript is given as numbered sentences: `[s<index>] <start>-<end>s | <text>`.
A clip is a contiguous range of sentences, from sentence_start to sentence_end inclusive.

Rules for every candidate:
- It opens on a hook: a claim, question, surprising fact or strong emotion. Never mid-thought.
- It is understandable without the rest of the video. Reject passages that refer to earlier \
context ("as I said", "comme je disais tout à l'heure", unexplained "he"/"it"/"ça").
- It ends on a complete sentence that lands: a punchline, conclusion or clear takeaway.
- Its duration (end of last sentence minus start of first) is between {min_s:.0f} and \
{max_s:.0f} seconds.
- Candidates do not overlap.

Scores are integers from 0 to 100:
- hook: strength of the first 3 seconds.
- autonomie: how well it stands alone without context.
- intensite: emotional or informational intensity.
- chute: how satisfying the ending is.
- score_global: your overall prediction of clip performance (not an average).

Write justification (one or two sentences), titre_propose (a short clip title, max 70 \
characters) and accroche_ecran (an on-screen hook of 3 to 7 words) in the transcript language \
({language}).

Return up to {max_candidates} candidates, best first. Return an empty list if nothing qualifies. \
Quality over quantity."""


class MessagesClient(Protocol):
    """The subset of `anthropic.Anthropic().beta.messages` used here (eases testing)."""

    def create(self, **kwargs: Any) -> Any: ...


def format_window(sentences: list[Sentence]) -> str:
    return "\n".join(
        f"[s{s.index}] {s.start:.1f}-{s.end:.1f}s | {s.text}" for s in sentences
    )


def ask_claude(
    messages: MessagesClient,
    settings: Settings,
    ledger: CostLedger,
    window: list[Sentence],
    language: str,
    max_candidates: int = 6,
) -> list[Candidate]:
    system = SYSTEM_PROMPT.format(
        min_s=settings.clip_min_seconds,
        max_s=settings.clip_max_seconds,
        language=language,
        max_candidates=max_candidates,
    )
    response = messages.create(
        model=settings.claude_model_default,
        max_tokens=16000,
        system=system,
        messages=[
            {
                "role": "user",
                "content": "Transcript excerpt:\n\n" + format_window(window),
            }
        ],
        output_config={
            "effort": settings.claude_effort,
            "format": {"type": "json_schema", "schema": CANDIDATES_SCHEMA},
        },
        # Server-side fallback on policy refusals (routes by refusal category).
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
    )
    ledger.claude("segments", getattr(response, "model", settings.claude_model_default),
                  response.usage)
    if response.stop_reason == "refusal":
        return []
    if response.stop_reason == "max_tokens":
        raise RuntimeError("Claude response truncated (max_tokens)")
    text = next((b.text for b in response.content if b.type == "text"), "")
    try:
        payload = json.loads(text)
        return [Candidate.model_validate(c) for c in payload.get("candidates", [])]
    except (json.JSONDecodeError, ValidationError) as exc:
        raise RuntimeError(f"Invalid segment JSON from Claude: {exc}") from exc


def _ends_cleanly(sentences: list[Sentence], idx: int, transcript: Transcript) -> bool:
    """A sentence ends cleanly if it has final punctuation or is followed by a clear pause."""
    s = sentences[idx]
    if s.terminal:
        return True
    if idx + 1 >= len(sentences):
        return True
    return sentences[idx + 1].start - s.end >= 0.6


def to_segment(
    cand: Candidate, sentences: list[Sentence], transcript: Transcript, settings: Settings
) -> Segment | None:
    """Apply the editorial rules to one candidate. Returns None when it cannot be fixed."""
    a, b = cand.sentence_start, cand.sentence_end
    if a < 0 or b >= len(sentences) or a > b:
        return None
    if ORPHAN_RE.search(sentences[a].text):
        return None
    # Too long: drop trailing sentences until it fits, keeping a clean ending.
    while b > a and sentences[b].end - sentences[a].start > settings.clip_max_seconds:
        b -= 1
    # Make sure it ends on a complete sentence.
    while b > a and not _ends_cleanly(sentences, b, transcript):
        b -= 1
    if not _ends_cleanly(sentences, b, transcript):
        return None
    duration = sentences[b].end - sentences[a].start
    if duration < settings.clip_min_seconds or duration > settings.clip_max_seconds:
        return None

    words = transcript.words
    first_word, last_word = sentences[a].word_start, sentences[b].word_end
    prev_end = words[first_word - 1].end if first_word > 0 else 0.0
    next_start = words[last_word + 1].start if last_word + 1 < len(words) else transcript.duration
    start = max(prev_end, words[first_word].start - LEAD_IN, 0.0)
    end = min(next_start, words[last_word].end + TAIL_OUT, transcript.duration)
    return Segment(
        start=round(start, 3),
        end=round(end, 3),
        score_global=cand.score_global,
        hook=cand.hook,
        autonomie=cand.autonomie,
        intensite=cand.intensite,
        chute=cand.chute,
        justification=cand.justification,
        titre_propose=cand.titre_propose[:100],
        accroche_ecran=cand.accroche_ecran[:60],
        sentence_start=a,
        sentence_end=b,
        text=" ".join(s.text for s in sentences[a : b + 1]),
    )


def remove_overlaps(segments: list[Segment]) -> list[Segment]:
    """Greedy by score: keep the best segment, drop anything overlapping it, repeat."""
    kept: list[Segment] = []
    for seg in sorted(segments, key=lambda s: (-s.score_global, s.start)):
        if all(seg.end <= k.start or seg.start >= k.end for k in kept):
            kept.append(seg)
    return sorted(kept, key=lambda s: -s.score_global)


def detect_segments(
    messages: MessagesClient,
    transcript: Transcript,
    settings: Settings,
    ledger: CostLedger,
) -> list[Segment]:
    sentences = build_sentences(transcript)
    segments: list[Segment] = []
    for window in windows(sentences, settings.window_seconds, settings.window_overlap_seconds):
        if window[-1].end - window[0].start < settings.clip_min_seconds:
            continue
        for cand in ask_claude(messages, settings, ledger, window, transcript.language):
            seg = to_segment(cand, sentences, transcript, settings)
            if seg is not None:
                segments.append(seg)
    return remove_overlaps(segments)
