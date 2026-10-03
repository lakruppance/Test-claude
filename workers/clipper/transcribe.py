"""Transcription providers behind one interface. AssemblyAI is the default."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Protocol

from .config import Settings
from .costs import CostLedger
from .models import Transcript, Word


class TranscriptionProvider(Protocol):
    def transcribe(self, audio: Path, ledger: CostLedger) -> Transcript: ...


class AssemblyAIProvider:
    def __init__(self, settings: Settings):
        import assemblyai as aai

        aai.settings.api_key = os.environ["ASSEMBLYAI_API_KEY"]
        self._aai = aai
        self._settings = settings

    def transcribe(self, audio: Path, ledger: CostLedger) -> Transcript:
        aai = self._aai
        config = aai.TranscriptionConfig(
            speech_models=self._settings.assemblyai_speech_models,
            language_detection=True,
            language_detection_options=aai.LanguageDetectionOptions(
                expected_languages=self._settings.expected_languages,
                fallback_language="en",
            ),
            punctuate=True,
            format_text=True,
        )
        result = aai.Transcriber().transcribe(str(audio), config)
        if result.status == aai.TranscriptStatus.error:
            raise RuntimeError(f"AssemblyAI error: {result.error}")
        duration = float(result.audio_duration or 0)
        ledger.transcription(duration)
        words = [
            Word(text=w.text, start=w.start / 1000, end=w.end / 1000, confidence=w.confidence)
            for w in (result.words or [])
        ]
        language = str(result.json_response.get("language_code") or "en")
        return Transcript(language=language[:2], duration=duration, words=words,
                          source="assemblyai")


def get_provider(settings: Settings) -> TranscriptionProvider:
    name = os.environ.get("TRANSCRIPTION_PROVIDER", "assemblyai")
    if name == "assemblyai":
        return AssemblyAIProvider(settings)
    raise ValueError(f"Unsupported TRANSCRIPTION_PROVIDER: {name}")
