"""Data shapes shared across pipeline steps."""

from __future__ import annotations

from pydantic import BaseModel, Field


class Word(BaseModel):
    text: str
    start: float  # seconds
    end: float  # seconds
    confidence: float = 1.0


class Sentence(BaseModel):
    index: int
    start: float
    end: float
    text: str
    word_start: int  # index of first word in Transcript.words
    word_end: int  # index of last word (inclusive)
    terminal: bool  # ends with sentence-final punctuation


class Transcript(BaseModel):
    language: str
    duration: float
    words: list[Word]
    source: str = "assemblyai"


class Segment(BaseModel):
    """A validated clip candidate. Field names follow the product spec."""

    start: float
    end: float
    score_global: int = Field(ge=0, le=100)
    hook: int = Field(ge=0, le=100)
    autonomie: int = Field(ge=0, le=100)
    intensite: int = Field(ge=0, le=100)
    chute: int = Field(ge=0, le=100)
    justification: str
    titre_propose: str
    accroche_ecran: str = ""
    sentence_start: int
    sentence_end: int
    text: str = ""

    @property
    def duration(self) -> float:
        return self.end - self.start
