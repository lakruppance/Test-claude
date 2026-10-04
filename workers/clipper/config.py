"""Runtime settings, read from environment variables (never hardcoded secrets)."""

from __future__ import annotations

import os
from dataclasses import dataclass, field


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default)


def _float(name: str, default: float) -> float:
    raw = os.environ.get(name)
    return float(raw) if raw else default


def _int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    return int(raw) if raw else default


@dataclass(frozen=True)
class Prices:
    """Unit prices in USD used for cost accounting. Override via env when vendors change."""

    # AssemblyAI, per hour of audio
    transcription_per_hour: float = field(
        default_factory=lambda: _float("PRICE_TRANSCRIPTION_PER_HOUR", 0.21)
    )
    # Claude, per million tokens: {model: (input, output, cache_read, cache_write_5m)}
    claude: dict[str, tuple[float, float, float, float]] = field(
        default_factory=lambda: {
            "claude-sonnet-5-5": (2.0, 10.0, 0.20, 2.5),
            "claude-haiku-4-5": (1.0, 5.0, 0.10, 1.25),
            "claude-haiku-4-5-20251001": (1.0, 5.0, 0.10, 1.25),
            "claude-opus-5-5": (4.0, 20.0, 0.20, 5.0),
        }
    )
    # Modal, per physical core-second and per GiB-second
    modal_core_second: float = field(
        default_factory=lambda: _float("PRICE_MODAL_CORE_SECOND", 0.0000131)
    )
    modal_gib_second: float = field(
        default_factory=lambda: _float("PRICE_MODAL_GIB_SECOND", 0.00000222)
    )
    # Cloudflare R2, per GB-month stored
    r2_gb_month: float = field(default_factory=lambda: _float("PRICE_R2_GB_MONTH", 0.015))


@dataclass(frozen=True)
class Settings:
    claude_model_default: str = field(
        default_factory=lambda: _env("CLAUDE_MODEL_DEFAULT", "claude-sonnet-5-5")
    )
    claude_model_light: str = field(
        default_factory=lambda: _env("CLAUDE_MODEL_LIGHT", "claude-haiku-4-5")
    )
    claude_effort: str = field(default_factory=lambda: _env("CLAUDE_EFFORT", "medium"))
    # Proofread misheard words around the selected passages with the light model.
    transcript_correction: bool = field(
        default_factory=lambda: _env("TRANSCRIPT_CORRECTION", "true").lower() != "false"
    )
    # Burned into free-plan clips (brand name; the product name lives in the web app config).
    watermark_text: str = field(default_factory=lambda: _env("WATERMARK_TEXT", "Fait avec Pépite"))
    assemblyai_speech_models: list[str] = field(
        default_factory=lambda: [
            m.strip() for m in _env("ASSEMBLYAI_SPEECH_MODELS", "universal").split(",") if m.strip()
        ]
    )
    expected_languages: list[str] = field(default_factory=lambda: ["fr", "en"])

    clip_min_seconds: float = field(default_factory=lambda: _float("CLIP_MIN_SECONDS", 20))
    clip_max_seconds: float = field(default_factory=lambda: _float("CLIP_MAX_SECONDS", 60))
    clips_to_render: int = field(default_factory=lambda: _int("CLIPS_TO_RENDER", 3))
    max_source_minutes: float = field(default_factory=lambda: _float("MAX_SOURCE_MINUTES", 180))

    window_seconds: float = 480.0
    window_overlap_seconds: float = 60.0

    r2_bucket: str = field(default_factory=lambda: _env("R2_BUCKET"))
    r2_endpoint: str = field(default_factory=lambda: _env("R2_ENDPOINT"))
    supabase_url: str = field(default_factory=lambda: _env("NEXT_PUBLIC_SUPABASE_URL"))

    prices: Prices = field(default_factory=Prices)


def get_settings() -> Settings:
    return Settings()
