"""Pydantic schemas for the read-only catalog: languages + scenarios."""
from __future__ import annotations

from pydantic import BaseModel


class LanguageResponse(BaseModel):
    code: str
    display_name: str
    dialect_label: str
    stt_locale: str
    tts_locale: str


class ScenarioResponse(BaseModel):
    slug: str
    title: str
    goal: str
    goals: list[str]
    order: int
