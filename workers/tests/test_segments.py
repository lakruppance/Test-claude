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


def test_back_to_back_segments_are_both_kept():
    t = make_transcript(ten_word_sentences(40))
    s = build_sentences(t)
    a = to_segment(cand(0, 6, 70), s, t, settings())
    b = to_segment(cand(7, 13, 60), s, t, settings())
    assert b.start < a.end  # padding makes them touch
    assert len(remove_overlaps([a, b])) == 2


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


def test_platform_metadata_is_cleaned_and_never_fails():
    from clipper import metadata
    from clipper.devfakes import FakeMessages as DevFake
    from clipper.models import Segment

    seg = Segment(start=0, end=30, score_global=80, hook=80, autonomie=80, intensite=80, chute=80,
                  justification="j", titre_propose="Titre", sentence_start=0, sentence_end=2, text="Bonjour.")
    ledger = CostLedger(Settings().prices)
    meta = metadata.generate(DevFake(), Settings(), ledger, [seg, seg], "fr")
    assert set(meta) == {1, 2} and meta[1]["youtube"]["hashtags"][0] == "#shorts"
    assert metadata._clean_tags(["shorts", "#Mot clé!", "#shorts", "##x"], 5) == ["#shorts", "#Motclé", "#x"]

    class Broken:
        def create(self, **kwargs):
            raise RuntimeError("API down")

    assert metadata.generate(Broken(), Settings(), ledger, [seg], "fr") == {}


def test_claude_account_errors_become_clear_pipeline_errors():
    import anthropic
    import httpx
    import pytest

    from clipper.claude_errors import GuardedMessages
    from clipper.pipeline import PipelineError

    def failing(status, cls, message):
        class Inner:
            def create(self, **_):
                req = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
                raise cls(message, response=httpx.Response(status, request=req), body=None)
        return GuardedMessages(Inner())

    cases = [
        (401, anthropic.AuthenticationError, "invalid x-api-key", "claude_auth_failed"),
        (404, anthropic.NotFoundError, "model not found", "claude_model_unavailable"),
        (400, anthropic.BadRequestError, "Your credit balance is too low", "claude_no_credit"),
        (400, anthropic.BadRequestError, "invalid parameter", "claude_bad_request"),
    ]
    for status, cls, message, code in cases:
        with pytest.raises(PipelineError) as err:
            failing(status, cls, message).create(model="x")
        assert err.value.code == code


UNSUPPORTED_SCHEMA_KEYS = {"minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf",
                           "minLength", "maxLength", "minItems", "maxItems", "uniqueItems"}


def _check_schema(node, path="$"):
    if isinstance(node, dict):
        bad = UNSUPPORTED_SCHEMA_KEYS & node.keys()
        assert not bad, f"{path}: unsupported by structured outputs: {sorted(bad)}"
        if node.get("type") == "object":
            assert node.get("additionalProperties") is False, f"{path}: needs additionalProperties: false"
        for key, value in node.items():
            _check_schema(value, f"{path}.{key}")
    elif isinstance(node, list):
        for i, value in enumerate(node):
            _check_schema(value, f"{path}[{i}]")


def test_every_schema_sent_to_claude_is_accepted_by_structured_outputs():
    from clipper.metadata import META_SCHEMA
    from clipper.segments import CANDIDATES_SCHEMA

    for schema in (CANDIDATES_SCHEMA, META_SCHEMA):
        _check_schema(schema)


def test_out_of_range_scores_are_clamped_not_rejected():
    from clipper.segments import Candidate

    c = Candidate(sentence_start=0, sentence_end=2, score_global=104, hook=-3, autonomie=55.6,
                  intensite=50, chute=60, justification="j", titre_propose="t", accroche_ecran="a")
    assert (c.score_global, c.hook, c.autonomie) == (100, 0, 56)
