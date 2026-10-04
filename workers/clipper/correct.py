"""Subtitle proofreading: the light Claude model fixes words the speech recognizer misheard
("cache" -> "cash" in a sentence about money, "CTT" -> "cet été"), only around the selected
passages. Word timings and the word count are kept, so sentence boundaries, segment indices and
karaoke timing stay valid. Never raises: on any problem the transcript is returned unchanged."""

from __future__ import annotations

import json
import re
from typing import Any

from .config import Settings
from .costs import CostLedger
from .models import Segment, Transcript, Word
from .transcript import build_sentences

# Words around each passage that are proofread too (the review screen lets users widen a clip).
CONTEXT_SECONDS = 30.0
MAX_CORRECTIONS = 80

CORRECTION_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "corrections": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "sentence": {"type": "integer"},
                    "original": {"type": "string"},
                    "corrected": {"type": "string"},
                },
                "required": ["sentence", "original", "corrected"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["corrections"],
    "additionalProperties": False,
}

SYSTEM = """You proofread an automatic speech transcript ({language}) that becomes video \
subtitles. Sentences are numbered: `[s<n>] <text>`.

Fix ONLY words the speech recognizer clearly misheard, using the context:
- wrong homophones or near-homophones (e.g. "cache" for "cash" in a sentence about money);
- garbled or letter-split words (e.g. "CTT" for "cet été");
- common anglicisms, brands and tech terms written phonetically (e.g. "sasse" for "SaaS").

Never rephrase, never fix the speaker's grammar, slang or style, never change a word that is \
plausible as spoken. When unsure, leave it.

For each fix return the sentence number, `original`: the exact word or consecutive words as \
they appear in that sentence, and `corrected`: the replacement. Prefer one word per fix. \
Return an empty list when nothing needs fixing."""

_PUNCT_TAIL = re.compile(r"[.,!?;:…»\"')\]]+$")
_PUNCT_HEAD = re.compile(r"^[«\"'(\[]+")


def _norm(text: str) -> str:
    return re.sub(r"[^\w']+", "", text.lower().replace("’", "'"))


def _replace(word: Word, corrected: str) -> Word:
    """New text, keeping the original surrounding punctuation (sentence boundaries depend on it)."""
    head = _PUNCT_HEAD.match(word.text)
    tail = _PUNCT_TAIL.search(word.text)
    core = _PUNCT_TAIL.sub("", _PUNCT_HEAD.sub("", corrected.strip()))
    text = (head.group(0) if head else "") + core + (tail.group(0) if tail else "")
    return word.model_copy(update={"text": text})


def apply_corrections(transcript: Transcript, corrections: list[dict[str, Any]],
                      allowed_sentences: set[int]) -> tuple[Transcript, int]:
    sentences = build_sentences(transcript)
    words = list(transcript.words)
    applied = 0
    for fix in corrections[:MAX_CORRECTIONS]:
        idx = fix.get("sentence")
        original = str(fix.get("original", "")).split()
        corrected = str(fix.get("corrected", "")).split()
        if idx not in allowed_sentences or not 0 <= idx < len(sentences):
            continue
        if not original or not corrected:
            continue
        if len(" ".join(corrected)) > 3 * len(" ".join(original)) + 12:  # a rewrite, not a fix
            continue
        # Keep the word count: n -> n word by word, or 1 -> several kept as one subtitle unit.
        if len(corrected) != len(original) and len(original) != 1:
            continue
        s = sentences[idx]
        target = [_norm(t) for t in original]
        for i in range(s.word_start, s.word_end - len(original) + 2):
            if [_norm(w.text) for w in words[i : i + len(original)]] == target:
                if len(original) == 1:
                    words[i] = _replace(words[i], " ".join(corrected))
                else:
                    for k, new in enumerate(corrected):
                        words[i + k] = _replace(words[i + k], new)
                applied += 1
                break
    return transcript.model_copy(update={"words": words}), applied


def proofread(messages, settings: Settings, ledger: CostLedger, transcript: Transcript,
              segments: list[Segment]) -> tuple[Transcript, int]:
    """Returns (transcript, number of fixes applied)."""
    if not segments or not settings.transcript_correction:
        return transcript, 0
    sentences = build_sentences(transcript)
    spans = [(s.start - CONTEXT_SECONDS, s.end + CONTEXT_SECONDS) for s in segments]
    chosen = [s for s in sentences if any(s.end > a and s.start < b for a, b in spans)]
    if not chosen:
        return transcript, 0
    text = "\n".join(f"[s{s.index}] {s.text}" for s in chosen)
    try:
        response = messages.create(
            model=settings.claude_model_light,
            max_tokens=4000,
            system=SYSTEM.format(language=transcript.language),
            messages=[{"role": "user", "content": text}],
            output_config={"format": {"type": "json_schema", "schema": CORRECTION_SCHEMA}},
        )
        ledger.claude("correction", getattr(response, "model", settings.claude_model_light),
                      response.usage)
        if response.stop_reason != "end_turn":
            return transcript, 0
        body = next((b.text for b in response.content if b.type == "text"), "")
        corrections = json.loads(body).get("corrections", [])
    except Exception:  # proofreading must never fail the job
        return transcript, 0
    return apply_corrections(transcript, corrections, {s.index for s in chosen})


def refresh_segment_text(transcript: Transcript, segments: list[Segment]) -> list[Segment]:
    """Segment texts rebuilt from the corrected words (same sentence indices)."""
    sentences = build_sentences(transcript)
    out = []
    for s in segments:
        if s.sentence_end < len(sentences):
            chunk = sentences[s.sentence_start : s.sentence_end + 1]
            s = s.model_copy(update={"text": " ".join(x.text for x in chunk)})
        out.append(s)
    return out
