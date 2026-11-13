"""The guild link-preview card's colours must match the frontend's guild page, read from its TypeScript source."""
from __future__ import annotations

import re
from pathlib import Path

from app.core import guild_preview as cfg

GUILD_DATA = Path(__file__).resolve().parents[2] / "frontend" / "src" / "games" / "wow-forever" / "data"
# Tailwind's slate-800 / 700 / 900, which the banner's fallback names by class.
SLATE = {"slate-800": "#1e293b", "slate-700": "#334155", "slate-900": "#0f172a"}


def source(*parts: str) -> str:
    return GUILD_DATA.joinpath(*parts).read_text(encoding="utf-8")


def banner_stops(text: str, faction: str) -> tuple[str, ...]:
    match = re.search(rf'{faction}:\s*\{{\s*gradient:\s*"from-\[(#\w+)\] via-\[(#\w+)\] to-\[(#\w+)\]"', text)
    assert match, f"no {faction} gradient in guildBannerConfig.ts"
    return match.groups()


def lower(stops: tuple[str, ...]) -> tuple[str, ...]:
    return tuple(s.lower() for s in stops)


def test_class_colours_are_the_frontends_dark_values() -> None:
    found = dict(re.findall(r'(\w+):\s*\{\s*light:\s*"#\w+",\s*dark:\s*"(#\w+)"', source("guild", "classColors.ts")))
    assert len(found) == 9, "expected nine classes in classColors.ts"
    assert {k: v.lower() for k, v in cfg.CLASS_COLORS.items()} == {k: v.lower() for k, v in found.items()}


def test_banner_gradients_are_the_frontends() -> None:
    text = source("guild", "guildBannerConfig.ts")
    assert lower(cfg.GRADIENT_ALLIANCE) == lower(banner_stops(text, "alliance"))
    assert lower(cfg.GRADIENT_HORDE) == lower(banner_stops(text, "horde"))


def test_the_fallback_gradient_is_the_frontends_slate() -> None:
    text = source("guild", "guildBannerConfig.ts")
    match = re.search(r'GUILD_BANNER_FALLBACK[^\n]*gradient:\s*"from-(\S+) via-(\S+) to-(\S+)"', text)
    assert match, "no fallback gradient in guildBannerConfig.ts"
    assert lower(cfg.GRADIENT_FALLBACK) == tuple(SLATE[name] for name in match.groups())


def test_the_gold_is_the_pages_medal_and_podium_border() -> None:
    text = source("guild", "medalStyles.ts")
    medal = re.search(r'1:\s*"bg-\[(#\w+)\]', text)
    border = re.search(r'GOLD_BORDER\s*=\s*"border-\[(#\w+)\]"', text)
    assert medal and border, "gold constants not found in medalStyles.ts"
    assert cfg.GOLD_MEDAL.lower() == medal.group(1).lower()
    assert cfg.GOLD_BORDER.lower() == border.group(1).lower()


def test_the_level_cap_is_the_frontends() -> None:
    match = re.search(r"MAX_LEVEL\s*=\s*(\d+)", source("levelCap.ts"))
    assert match, "MAX_LEVEL not found in levelCap.ts"
    assert cfg.MAX_LEVEL == int(match.group(1))
