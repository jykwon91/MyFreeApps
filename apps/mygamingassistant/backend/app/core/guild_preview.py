"""The guild page's link-preview card (``GET /wow/guilds/{slug}/preview.png``): sizes, colours, copy.

The colours mirror the frontend's guild page — ``classColors.ts`` (dark values: names sit on dark panels),
``guildBannerConfig.ts`` (the banner's faction gradient) and ``medalStyles.ts`` (the gold). A conformance test
(``tests/test_guild_preview_colors.py``) reads those files and fails when they drift.
"""
from __future__ import annotations

from pathlib import Path
from typing import Final

from app.schemas.wow.guild.guild_preview_row_style import GuildPreviewRowStyle

FONT_PATH: Final = Path(__file__).resolve().parents[2] / "data" / "fonts" / "Inter-opsz-wght.ttf"
FONT_OPTICAL_SIZE: Final = 32

WIDTH: Final = 1200
HEIGHT: Final = 630
MARGIN: Final = 56
# Discord and other unfurlers drop big images.
MAX_BYTES: Final = 300 * 1024

SITE_HOST: Final = "mygamingassistant.myfreeapps.org"
BRAND_NAME: Final = "MyGamingAssistant"
# The generic WoW Forever card the page showed before; served when the guild can't be drawn.
FALLBACK_IMAGE_PATH: Final = "/link-preview/wow-forever.png"
CACHE_CONTROL: Final = "public, max-age=3600"

# Forever's level cap (frontend ``data/levelCap.ts``): "12 at 60".
MAX_LEVEL: Final = 60
PODIUM_SIZE: Final = 3
COMPACT_FROM: Final = 10_000

# Faction -> the banner's gradient stops (from, via, to), drawn top-left to bottom-right.
GRADIENT_ALLIANCE: Final = ("#0b2a6b", "#1d4ed8", "#0b1d4d")
GRADIENT_HORDE: Final = ("#5c0a0a", "#b91c1c", "#2b0505")
# Tailwind slate-800 / 700 / 900: the banner's fallback for an unknown faction.
GRADIENT_FALLBACK: Final = ("#1e293b", "#334155", "#0f172a")
GRADIENTS: Final = {"alliance": GRADIENT_ALLIANCE, "horde": GRADIENT_HORDE}

# Class name (lowercase) -> the in-game colour, as the page shows names on dark.
CLASS_COLORS: Final = {
    "warrior": "#C79C6E",
    "paladin": "#F58CBA",
    "hunter": "#ABD473",
    "rogue": "#FFF569",
    "priest": "#FFFFFF",
    "shaman": "#4DA3FF",
    "mage": "#69CCF0",
    "warlock": "#9482C9",
    "druid": "#FF7D0A",
}
CLASS_COLOR_UNKNOWN: Final = "#E2E8F0"

# The page's 1st-place gold: the medal's fill, and the podium card's border.
GOLD_MEDAL: Final = "#F2C94C"
GOLD_BORDER: Final = "#B8902A"

TEXT: Final = "#FFFFFF"
TEXT_MUTED: Final = "#E2E8F0"
SCRIM_ALPHA: Final = 140  # ~55% black

# Panel layout (px).
PANEL_WIDTH: Final = 528
PANEL_GAP: Final = 32
PANEL_TOP: Final = 236
PANEL_HEIGHT: Final = 284
PANEL_PAD: Final = 24
PANEL_RADIUS: Final = 22
HEADING_SIZE: Final = 30
RANK_COLUMN: Final = 52
NUMBER_GAP: Final = 14
ELLIPSIS: Final = "…"


# 1st place is the big row; the next two are compact (names >= 34px, numbers >= 36px).
ROW_STYLES: Final = (
    GuildPreviewRowStyle(top=76, height=80, name_max=46, name_min=40, number_size=52),
    GuildPreviewRowStyle(top=156, height=60, name_max=36, name_min=34, number_size=36),
    GuildPreviewRowStyle(top=216, height=60, name_max=36, name_min=34, number_size=36),
)
