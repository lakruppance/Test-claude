import sys
from types import ModuleType, SimpleNamespace

import pytest

from clipper.config import Settings
from clipper.costs import CostLedger
from clipper.transcribe import FakeTranscriptionProvider, WhisperProvider, get_provider


class FakeWhisperModel:
    calls: list = []

    def __init__(self, *args, **kwargs):
        pass

    def transcribe(self, path, word_timestamps, vad_filter, language=None):
        FakeWhisperModel.calls.append(language)
        detected = language or "de"
        words = [SimpleNamespace(word=" Bonjour", start=0.1, end=0.5, probability=0.9),
                 SimpleNamespace(word=" à", start=0.5, end=0.6, probability=0.8),
                 SimpleNamespace(word=" tous.", start=0.6, end=1.0, probability=0.95)]
        info = SimpleNamespace(language=detected, duration=12.5,
                               all_language_probs=[("de", 0.5), ("fr", 0.3), ("en", 0.2)])
        return iter([SimpleNamespace(words=words)]), info


@pytest.fixture
def fake_faster_whisper(monkeypatch):
    module = ModuleType("faster_whisper")
    module.WhisperModel = FakeWhisperModel
    monkeypatch.setitem(sys.modules, "faster_whisper", module)
    monkeypatch.setattr(WhisperProvider, "_model", None)
    FakeWhisperModel.calls = []


def test_whisper_words_and_language_restricted_to_fr_en(fake_faster_whisper, tmp_path):
    ledger = CostLedger(Settings().prices)
    t = WhisperProvider(Settings()).transcribe(tmp_path / "a.mp3", ledger)
    # detected "de" is outside FR/EN -> re-run forced to the likelier of fr/en
    assert FakeWhisperModel.calls == [None, "fr"]
    assert t.language == "fr" and t.source == "whisper"
    assert [w.text for w in t.words] == ["Bonjour", "à", "tous."]
    assert ledger.total_usd == 0


def test_fake_providers_refused_outside_development(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    with pytest.raises(RuntimeError):
        FakeTranscriptionProvider(Settings())
    monkeypatch.setenv("TRANSCRIPTION_PROVIDER", "fake")
    with pytest.raises(RuntimeError):
        get_provider(Settings())
