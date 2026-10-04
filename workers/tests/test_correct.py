import json
from types import SimpleNamespace

from clipper.config import Settings
from clipper.correct import apply_corrections, proofread, refresh_segment_text
from clipper.costs import CostLedger
from clipper.models import Segment, Transcript, Word
from clipper.transcript import build_sentences

TEXT = "On a du cache sur le compte. Je pars en vacances CTT à Rome. C'est top !"


def transcript() -> Transcript:
    words = [Word(text=t, start=i * 0.5, end=i * 0.5 + 0.4) for i, t in enumerate(TEXT.split())]
    return Transcript(language="fr", duration=20, words=words, source="test")


def test_corrections_keep_timing_count_and_sentence_punctuation():
    t = transcript()
    fixes = [
        {"sentence": 0, "original": "cache", "corrected": "cash"},
        {"sentence": 1, "original": "CTT", "corrected": "cet été"},
        {"sentence": 2, "original": "top", "corrected": "top."},  # punctuation comes from source
        {"sentence": 0, "original": "absent", "corrected": "x"},  # not in the sentence
        {"sentence": 5, "original": "Rome", "corrected": "Paris"},  # sentence not proofread
    ]
    fixed, applied = apply_corrections(t, fixes, allowed_sentences={0, 1, 2})
    assert applied == 3
    texts = [w.text for w in fixed.words]
    assert "cash" in texts and "cet été" in texts and "top" in texts and "!" in texts
    assert len(fixed.words) == len(t.words)
    assert [w.start for w in fixed.words] == [w.start for w in t.words]
    assert len(build_sentences(fixed)) == len(build_sentences(t))


def test_multiword_fix_must_keep_word_count():
    fixed, applied = apply_corrections(
        transcript(), [{"sentence": 0, "original": "le compte.", "corrected": "le compte bancaire"}], {0})
    assert applied == 0
    fixed, applied = apply_corrections(
        transcript(), [{"sentence": 0, "original": "le compte.", "corrected": "la caisse"}], {0})
    assert applied == 1 and fixed.words[6].text == "caisse."


class FakeMessages:
    def __init__(self, payload=None, error=None):
        self.payload, self.error, self.calls = payload, error, []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        if self.error:
            raise self.error
        return SimpleNamespace(
            model="claude-haiku-4-5", stop_reason="end_turn",
            content=[SimpleNamespace(type="text", text=json.dumps(self.payload))],
            usage=SimpleNamespace(input_tokens=900, output_tokens=60, cache_read_input_tokens=0,
                                  cache_creation_input_tokens=0),
        )


def segment() -> Segment:
    return Segment(start=0, end=6, score_global=80, hook=80, autonomie=80, intensite=80, chute=80,
                   justification="j", titre_propose="t", sentence_start=0, sentence_end=1,
                   text="old")


def test_proofread_uses_the_light_model_records_cost_and_refreshes_segment_text():
    settings = Settings()
    ledger = CostLedger(settings.prices)
    messages = FakeMessages({"corrections": [{"sentence": 0, "original": "cache", "corrected": "cash"}]})
    fixed, applied = proofread(messages, settings, ledger, transcript(), [segment()])
    assert applied == 1
    assert messages.calls[0]["model"] == settings.claude_model_light
    assert "[s0] On a du cache" in messages.calls[0]["messages"][0]["content"]
    assert any(line.item == "claude:correction" or "correction" in line.item for line in ledger.lines)
    assert refresh_segment_text(fixed, [segment()])[0].text.startswith("On a du cash sur le compte.")


def test_proofread_never_fails_the_job():
    settings = Settings()
    t = transcript()
    out, applied = proofread(FakeMessages(error=RuntimeError("boom")), settings,
                             CostLedger(settings.prices), t, [segment()])
    assert applied == 0 and out == t
