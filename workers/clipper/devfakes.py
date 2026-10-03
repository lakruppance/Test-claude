"""Development-only stand-ins for paid providers, to smoke-test the local stack without any
API key. Refused outside development. Never used in staging or production."""

from __future__ import annotations

import json
import os
from types import SimpleNamespace
from typing import Any


def assert_dev(feature: str) -> None:
    if os.environ.get("APP_ENV", "development") != "development":
        raise RuntimeError(f"{feature} is only allowed when APP_ENV=development")


class FakeMessages:
    """Returns the first two 25-45 s sentence ranges of each window as candidates."""

    def create(self, **kwargs: Any) -> Any:
        import re

        lines = kwargs["messages"][0]["content"].splitlines()
        spans = [
            (int(m.group(1)), float(m.group(2)), float(m.group(3)))
            for m in (re.match(r"\[s(\d+)\] ([\d.]+)-([\d.]+)s", line) for line in lines)
            if m
        ]
        candidates, i = [], 0
        while i < len(spans) and len(candidates) < 2:
            j = i
            while j < len(spans) and spans[j][2] - spans[i][1] < 25:
                j += 1
            if j < len(spans) and spans[j][2] - spans[i][1] <= 45:
                candidates.append({
                    "sentence_start": spans[i][0], "sentence_end": spans[j][0],
                    "score_global": 70 - 10 * len(candidates), "hook": 60, "autonomie": 60,
                    "intensite": 50, "chute": 60,
                    "justification": "Test local (faux modèle) : passage choisi par durée.",
                    "titre_propose": f"Clip de test {len(candidates) + 1}",
                    "accroche_ecran": "Test local",
                })
            i = j + 1
        return SimpleNamespace(
            model="dev-fake", stop_reason="end_turn",
            content=[SimpleNamespace(type="text", text=json.dumps({"candidates": candidates}))],
            usage=SimpleNamespace(input_tokens=0, output_tokens=0, cache_read_input_tokens=0,
                                  cache_creation_input_tokens=0),
        )
