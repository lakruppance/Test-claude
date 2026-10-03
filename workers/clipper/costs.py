"""Cost ledger: every billable action of a job is recorded as a line with its USD amount."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any

from .config import Prices


@dataclass
class CostLine:
    provider: str  # assemblyai | anthropic | modal | r2
    item: str  # e.g. "transcription", "segments:claude-sonnet-5-5", "render"
    quantity: float
    unit: str  # hour | token | core_second | gb_month
    usd: float
    meta: dict[str, Any] = field(default_factory=dict)


@dataclass
class CostLedger:
    prices: Prices
    lines: list[CostLine] = field(default_factory=list)

    def transcription(self, audio_seconds: float) -> CostLine:
        hours = audio_seconds / 3600
        line = CostLine(
            "assemblyai", "transcription", hours, "hour", hours * self.prices.transcription_per_hour
        )
        self.lines.append(line)
        return line

    def claude(self, item: str, model: str, usage: Any) -> CostLine:
        """Price a Claude call from the `usage` object of the API response."""
        price = self.prices.claude.get(model)
        if price is None:
            # Unknown model: price at the most expensive known rate so costs are never understated.
            price = max(self.prices.claude.values(), key=lambda p: p[1])
        p_in, p_out, p_cache_read, p_cache_write = price
        input_tokens = getattr(usage, "input_tokens", 0) or 0
        output_tokens = getattr(usage, "output_tokens", 0) or 0
        cache_read = getattr(usage, "cache_read_input_tokens", 0) or 0
        cache_write = getattr(usage, "cache_creation_input_tokens", 0) or 0
        usd = (
            input_tokens * p_in
            + output_tokens * p_out
            + cache_read * p_cache_read
            + cache_write * p_cache_write
        ) / 1_000_000
        line = CostLine(
            "anthropic",
            f"{item}:{model}",
            input_tokens + output_tokens + cache_read + cache_write,
            "token",
            usd,
            {
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "cache_read_input_tokens": cache_read,
                "cache_creation_input_tokens": cache_write,
            },
        )
        self.lines.append(line)
        return line

    def compute(self, item: str, seconds: float, cores: float, memory_gib: float) -> CostLine:
        usd = seconds * (
            cores * self.prices.modal_core_second + memory_gib * self.prices.modal_gib_second
        )
        line = CostLine(
            "modal",
            item,
            seconds * cores,
            "core_second",
            usd,
            {"seconds": round(seconds, 2), "cores": cores, "memory_gib": memory_gib},
        )
        self.lines.append(line)
        return line

    def storage(self, item: str, size_bytes: int, retention_days: float) -> CostLine:
        gb_month = size_bytes / 1e9 * retention_days / 30
        line = CostLine("r2", item, gb_month, "gb_month", gb_month * self.prices.r2_gb_month)
        self.lines.append(line)
        return line

    @property
    def total_usd(self) -> float:
        return sum(line.usd for line in self.lines)

    def to_rows(self) -> list[dict[str, Any]]:
        return [asdict(line) for line in self.lines]
