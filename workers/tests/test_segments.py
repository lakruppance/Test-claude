import json
from types import SimpleNamespace

from clipper.config import Settings
from clipper.costs import CostLedger
from clipper.models import Transcript, Word
from clipper.segments import Candidate, detect_segments, remove_overlaps, to_segment
from clipper.transcript import build_sentences, windows


def make_transcript(sentences: list[str], words_per_second: float = 2.5, gap: float = 0.3):
    words, t = [], 0.0
    for sentence in sentences:
        for token in sentence.split():
            words.append(Word(text=token, start=round(t, 3), end=round(t + 0.3, 3)))
            t += 1 / words_per_second
        t += gap
    return Transcript(language="fr", duration=t + 1, words=words)


def ten_word_sentences(n: int, prefix: str = "Phrase") -> list[str]:
    return [f"{prefix} {i} " + " ".join(["mot"] * 8) + "." for i in range(n)]


def settings(**kw) -> Settings:
    s = Settings()
    object.__setattr__(s, "clip_min_seconds", kw.get("min", 20))
    object.__setattr__(s, "clip_max_seconds", kw.get("max", 60))
    return s


def cand(a: int, b: int, score: int = 80) -> Candidate:
    return Candidate(sentence_start=a, sentence_end=b, score_global=score, hook=80, autonomie=80,
                     intensite=80, chute=80, justification="ok", titre_propose="Titre",
                     accroche_ecran="Accroche")


def test_sentences_split_on_punctuation_and_pause():
    t = make_transcript(["Bonjour à tous.", "Aujourd'hui on parle de vidéo"], gap=1.5)
    sentences = build_sentences(t)
    assert [s.text for s in sentences] == ["Bonjour à tous.", "Aujourd'hui on parle de vidéo"]
    assert sentences[0].terminal and not sentences[1].terminal


def test_windows_cover_everything_without_cutting_sentences():
    t = make_transcript(ten_word_sentences(200))
    sentences = build_sentences(t)
    ws = windows(sentences, 120, 20)
    covered = {s.index for w in ws for s in w}
    assert covered == {s.index for s in sentences}
    assert all(w[-1].end - w[0].start <= 120 for w in ws)
    # consecutive windows overlap
    assert all(ws[i + 1][0].index <= ws[i][-1].index for i in range(len(ws) - 1))


def test_segment_bounds_snap_to_words_with_padding():
    t = make_transcript(ten_word_sentences(20))
    sentences = build_sentences(t)
    seg = to_segment(cand(2, 7), sentences, t, settings())
    assert seg is not None
    first = t.words[sentences[2].word_start]
    last = t.words[sentences[7].word_end]
    assert first.start - 0.16 <= seg.start <= first.start
    assert last.end <= seg.end <= last.end + 0.36
    assert 20 <= seg.duration <= 61


def test_too_long_segment_is_trimmed_to_max_duration():
    t = make_transcript(ten_word_sentences(40))
    seg = to_segment(cand(0, 30), build_sentences(t), t, settings(max=45))
    assert seg is not None and seg.duration <= 45.5


def test_too_short_segment_is_rejected():
    t = make_transcript(ten_word_sentences(10))
    assert to_segment(cand(0, 1), build_sentences(t), t, settings()) is None


def test_orphan_reference_opening_is_rejected():
    sents = ["Comme je disais tout à l'heure c'est essentiel pour tout le monde."]
    t = make_transcript(sents + ten_word_sentences(15))
    assert to_segment(cand(0, 8), build_sentences(t), t, settings()) is None


def test_overlaps_are_removed_keeping_best_score():
    t = make_transcript(ten_word_sentences(40))
    s = build_sentences(t)
    a = to_segment(cand(0, 6, 70), s, t, settings())
    b = to_segment(cand(4, 10, 90), s, t, settings())
    c = to_segment(cand(20, 26, 60), s, t, settings())
    kept = remove_overlaps([a, b, c])
    assert [k.score_global for k in kept] == [90, 60]


class FakeMessages:
    def __init__(self, payloads):
        self.payloads = list(payloads)
        self.calls = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        payload = self.payloads.pop(0) if self.payloads else {"candidates": []}
        return SimpleNamespace(
            model=kwargs["model"],
            stop_reason="end_turn",
            content=[SimpleNamespace(type="text", text=json.dumps(payload))],
            usage=SimpleNamespace(input_tokens=1000, output_tokens=500,
                                  cache_read_input_tokens=0, cache_creation_input_tokens=0),
        )


def test_detect_segments_end_to_end_with_fake_claude():
    t = make_transcript(ten_word_sentences(30))
    payload = {"candidates": [c.model_dump() for c in (cand(1, 6, 88), cand(10, 16, 75))]}
    fake = FakeMessages([payload])
    ledger = CostLedger(Settings().prices)
    segs = detect_segments(fake, t, settings(), ledger)
    assert [s.score_global for s in segs] == [88, 75]
    call = fake.calls[0]
    assert call["output_config"]["format"]["type"] == "json_schema"
    assert call["fallbacks"] == "default"
    # 1000 * $2/M + 500 * $10/M = $0.007
    assert abs(ledger.total_usd - 0.007) < 1e-9


def test_local_runtime_reports_free_compute_with_cloud_equivalent(monkeypatch):
    monkeypatch.setenv("CLIPPER_RUNTIME", "local")
    ledger = CostLedger(Settings().prices)
    line = ledger.compute("render", 100, 4, 8)
    assert line.provider == "local" and line.usd == 0
    assert line.meta["cloud_equivalent_usd"] > 0
