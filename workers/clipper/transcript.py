"""Sentence segmentation over word-level timestamps."""

from __future__ import annotations

from .models import Sentence, Transcript

TERMINAL = (".", "?", "!", "…", "?»", "!»", ".»", '."', '?"', '!"')
# A pause this long ends a sentence even without punctuation.
PAUSE_SPLIT_SECONDS = 1.2


def build_sentences(transcript: Transcript) -> list[Sentence]:
    sentences: list[Sentence] = []
    words = transcript.words
    if not words:
        return sentences
    start_idx = 0
    for i, word in enumerate(words):
        is_last = i == len(words) - 1
        terminal = word.text.rstrip().endswith(TERMINAL)
        pause = (not is_last) and (words[i + 1].start - word.end >= PAUSE_SPLIT_SECONDS)
        if terminal or pause or is_last:
            chunk = words[start_idx : i + 1]
            sentences.append(
                Sentence(
                    index=len(sentences),
                    start=chunk[0].start,
                    end=chunk[-1].end,
                    text=" ".join(w.text for w in chunk),
                    word_start=start_idx,
                    word_end=i,
                    terminal=terminal,
                )
            )
            start_idx = i + 1
    return sentences


def windows(
    sentences: list[Sentence], window_seconds: float, overlap_seconds: float
) -> list[list[Sentence]]:
    """Split sentences into overlapping time windows that never cut a sentence."""
    if not sentences:
        return []
    result: list[list[Sentence]] = []
    i = 0
    while i < len(sentences):
        window_start = sentences[i].start
        j = i
        while j < len(sentences) and sentences[j].end - window_start <= window_seconds:
            j += 1
        j = max(j, i + 1)
        result.append(sentences[i:j])
        if j >= len(sentences):
            break
        # Next window starts `overlap_seconds` before the end of this one.
        boundary = sentences[j - 1].end - overlap_seconds
        k = j - 1
        while k > i and sentences[k].start > boundary:
            k -= 1
        i = max(k, i + 1)
    return result
