"""Transcription providers behind one interface. AssemblyAI is the default."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Protocol

from .config import Settings
from .costs import CostLedger, CostLine
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


class WhisperProvider:
    """Local transcription with faster-whisper (no account, no API cost). Word timestamps come
    from Whisper's alignment; accuracy is below AssemblyAI on noisy audio. The model is
    downloaded from Hugging Face on first use and cached (WHISPER_CACHE_DIR)."""

    _model = None  # loaded once per process

    def __init__(self, settings: Settings):
        self._settings = settings

    @classmethod
    def _load(cls):
        if cls._model is None:
            from faster_whisper import WhisperModel

            cls._model = WhisperModel(
                os.environ.get("WHISPER_MODEL", "small"),
                device="cpu",
                compute_type=os.environ.get("WHISPER_COMPUTE_TYPE", "int8"),
                download_root=os.environ.get("WHISPER_CACHE_DIR") or None,
            )
        return cls._model

    def transcribe(self, audio: Path, ledger: CostLedger) -> Transcript:
        model = self._load()
        allowed = self._settings.expected_languages
        segments, info = model.transcribe(str(audio), word_timestamps=True, vad_filter=True)
        language = info.language
        if language not in allowed:
            # Only French and English are supported: retry with the more likely of the two.
            probs = dict(info.all_language_probs or [])
            language = max(allowed, key=lambda code: probs.get(code, 0.0))
            segments, info = model.transcribe(str(audio), word_timestamps=True, vad_filter=True,
                                              language=language)
        words = [
            Word(text=w.word.strip(), start=float(w.start), end=float(w.end),
                 confidence=float(w.probability))
            for seg in segments
            for w in (seg.words or [])
            if w.word.strip()
        ]
        duration = float(info.duration)
        ledger.lines.append(
            CostLine("local", "transcription:whisper", duration / 3600, "hour", 0.0)
        )
        return Transcript(language=language, duration=duration, words=words, source="whisper")


class FakeTranscriptionProvider:
    """Dev-only: synthetic words over the audio duration, to smoke-test the stack offline."""

    def __init__(self, settings: Settings):
        from .devfakes import assert_dev

        assert_dev("TRANSCRIPTION_PROVIDER=fake")

    def transcribe(self, audio: Path, ledger: CostLedger) -> Transcript:
        from .reframe import probe_duration

        duration = probe_duration(audio)
        words, t, i = [], 0.4, 0
        while t < duration - 0.5:
            text = f"mot{i}" + ("." if i % 12 == 11 else "")
            words.append(Word(text=text, start=t, end=t + 0.3))
            t += 0.42
            i += 1
        return Transcript(language="fr", duration=duration, words=words, source="fake")


def get_provider(settings: Settings) -> TranscriptionProvider:
    name = os.environ.get("TRANSCRIPTION_PROVIDER", "assemblyai")
    if name == "assemblyai":
        return AssemblyAIProvider(settings)
    if name == "whisper":
        return WhisperProvider(settings)
    if name == "fake":
        return FakeTranscriptionProvider(settings)
    raise ValueError(f"Unsupported TRANSCRIPTION_PROVIDER: {name}")
