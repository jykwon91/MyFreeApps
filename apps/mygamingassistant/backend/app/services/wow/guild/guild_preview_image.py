"""Draws the guild's link-preview card: the page banner's faction gradient, the guild's name, two podium panels.

1200x630, laid out to read when Discord shows it ~400px wide: no text under 28px, nothing within ``MARGIN`` of
the edge. Text is Inter (SIL OFL 1.1, bundled in ``data/fonts``). Pure drawing: the numbers and ranks come
from ``guild_preview_boards``.
"""
from __future__ import annotations

import io
from collections.abc import Sequence

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

from app.core import guild_preview as cfg
from app.schemas.wow.guild.guild_preview_board import GuildPreviewBoard
from app.schemas.wow.guild.guild_preview_entry import GuildPreviewEntry
from app.schemas.wow.guild.guild_preview_row_style import GuildPreviewRowStyle
from app.services.wow.guild.guild_preview_boards import format_compact

Rgb = tuple[int, int, int]

def rgb(hex_color: str) -> Rgb:
    value = hex_color.lstrip("#")
    return int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16)


def gradient(stops: Sequence[str], size: tuple[int, int]) -> Image.Image:
    """CSS ``to bottom right`` through three stops: the 50% line runs through the other two corners."""
    width, height = size
    ys, xs = np.mgrid[0:height, 0:width].astype(np.float32)
    t = 0.5 + ((xs + 0.5 - width / 2) * height + (ys + 0.5 - height / 2) * width) / (2 * width * height)
    colours = np.array([rgb(s) for s in stops], dtype=np.float32)
    lower = np.clip(t * 2, 0, 1)[..., None]
    upper = np.clip(t * 2 - 1, 0, 1)[..., None]
    pixels = np.where(
        (t < 0.5)[..., None],
        colours[0] + (colours[1] - colours[0]) * lower,
        colours[1] + (colours[2] - colours[1]) * upper,
    )
    return Image.fromarray(np.rint(pixels).astype(np.uint8), "RGB").convert("RGBA")


class Painter:
    """One card's canvas and its fonts (a render builds its own: a FreeType face isn't shared across threads)."""

    def __init__(self, faction: str) -> None:
        self.canvas = gradient(cfg.GRADIENTS.get(faction, cfg.GRADIENT_FALLBACK), (cfg.WIDTH, cfg.HEIGHT))
        self._fonts: dict[tuple[int, int], ImageFont.FreeTypeFont] = {}

    def font(self, size: int, weight: int) -> ImageFont.FreeTypeFont:
        key = (size, weight)
        if key not in self._fonts:
            face = ImageFont.truetype(str(cfg.FONT_PATH), size)
            face.set_variation_by_axes([cfg.FONT_OPTICAL_SIZE, weight])
            self._fonts[key] = face
        return self._fonts[key]

    def fit(self, text: str, max_width: float, max_size: int, min_size: int, weight: int) -> tuple[str, ImageFont.FreeTypeFont]:
        """``text`` in the largest font that fits; at the smallest size, cut with an ellipsis."""
        for size in range(max_size, min_size - 1, -2):
            face = self.font(size, weight)
            if face.getlength(text) <= max_width:
                return text, face
        face = self.font(min_size, weight)
        cut = text
        while cut and face.getlength(cut + cfg.ELLIPSIS) > max_width:
            cut = cut[:-1]
        return cut.rstrip() + cfg.ELLIPSIS, face

    def shadowed_text(self, xy: tuple[int, int], text: str, face: ImageFont.FreeTypeFont) -> None:
        layer = Image.new("RGBA", self.canvas.size, (0, 0, 0, 0))
        ImageDraw.Draw(layer).text((xy[0], xy[1] + 4), text, font=face, fill=(0, 0, 0, 150), anchor="ls")
        self.canvas.alpha_composite(layer.filter(ImageFilter.GaussianBlur(7)))
        ImageDraw.Draw(self.canvas).text(xy, text, font=face, fill=rgb(cfg.TEXT), anchor="ls")

    def panel(self, left: int, board: GuildPreviewBoard) -> None:
        right = left + cfg.PANEL_WIDTH
        scrim = Image.new("RGBA", self.canvas.size, (0, 0, 0, 0))
        ImageDraw.Draw(scrim).rounded_rectangle(
            (left, cfg.PANEL_TOP, right, cfg.PANEL_TOP + cfg.PANEL_HEIGHT), cfg.PANEL_RADIUS, fill=(0, 0, 0, cfg.SCRIM_ALPHA),
        )
        self.canvas.alpha_composite(scrim)
        draw = ImageDraw.Draw(self.canvas)
        inner_left, inner_right = left + cfg.PANEL_PAD, right - cfg.PANEL_PAD
        draw.text(
            (inner_left, cfg.PANEL_TOP + 52), board.title, font=self.font(cfg.HEADING_SIZE, 700), fill=rgb(cfg.TEXT_MUTED), anchor="ls",
        )
        for entry, style in zip(board.entries, cfg.ROW_STYLES):
            self.row(entry, style, inner_left, inner_right)

    def row(self, entry: GuildPreviewEntry, style: GuildPreviewRowStyle, inner_left: int, inner_right: int) -> None:
        top = cfg.PANEL_TOP + style.top
        middle = top + style.height // 2
        first = entry.rank == 1
        draw = ImageDraw.Draw(self.canvas)
        if first:
            # 1st place (every one, on a tie) carries the page's gold: a gold-edged, gold-tinted row.
            glow = Image.new("RGBA", self.canvas.size, (0, 0, 0, 0))
            ImageDraw.Draw(glow).rounded_rectangle(
                (inner_left - 12, top, inner_right + 12, top + style.height - 6), 14,
                fill=(*rgb(cfg.GOLD_MEDAL), 38), outline=rgb(cfg.GOLD_BORDER), width=3,
            )
            self.canvas.alpha_composite(glow)
        rank_face = self.font(style.name_min, 800)
        rank_colour = rgb(cfg.GOLD_MEDAL) if first else rgb(cfg.TEXT_MUTED)
        draw.text((inner_left, middle), f"{entry.rank}.", font=rank_face, fill=rank_colour, anchor="lm")

        number = format_compact(entry.value)
        number_face = self.font(style.number_size, 800)
        draw.text((inner_right, middle), number, font=number_face, fill=rgb(cfg.TEXT), anchor="rm")

        name_left = inner_left + cfg.RANK_COLUMN
        room = inner_right - number_face.getlength(number) - cfg.NUMBER_GAP - name_left
        name, name_face = self.fit(entry.name, room, style.name_max, style.name_min, 800)
        colour = cfg.CLASS_COLORS.get((entry.class_name or "").lower(), cfg.CLASS_COLOR_UNKNOWN)
        draw.text((name_left, middle), name, font=name_face, fill=rgb(colour), anchor="lm")

    def brand(self) -> None:
        draw = ImageDraw.Draw(self.canvas)
        baseline = cfg.HEIGHT - cfg.MARGIN + 18
        draw.rounded_rectangle((cfg.MARGIN, baseline - 30, cfg.MARGIN + 9, baseline), 3, fill=rgb(cfg.GOLD_MEDAL))
        draw.text((cfg.MARGIN + 24, baseline), cfg.BRAND_NAME, font=self.font(30, 700), fill=rgb(cfg.TEXT), anchor="ls")
        draw.text(
            (cfg.WIDTH - cfg.MARGIN, baseline), cfg.SITE_HOST, font=self.font(28, 500), fill=rgb(cfg.TEXT_MUTED), anchor="rs",
        )


def panel_lefts(count: int) -> list[int]:
    total = count * cfg.PANEL_WIDTH + (count - 1) * cfg.PANEL_GAP
    start = (cfg.WIDTH - total) // 2
    return [start + i * (cfg.PANEL_WIDTH + cfg.PANEL_GAP) for i in range(count)]


def render_card(guild_name: str, faction: str, subtitle: str, boards: Sequence[GuildPreviewBoard]) -> Image.Image:
    painter = Painter(faction)
    max_width = cfg.WIDTH - 2 * cfg.MARGIN
    title, title_face = painter.fit(f"<{guild_name}>", max_width, 112, 56, 800)
    painter.shadowed_text((cfg.MARGIN, 150), title, title_face)
    ImageDraw.Draw(painter.canvas).text(
        (cfg.MARGIN, 206), subtitle, font=painter.font(38, 600), fill=rgb(cfg.TEXT_MUTED), anchor="ls",
    )
    for left, board in zip(panel_lefts(len(boards)), boards):
        painter.panel(left, board)
    painter.brand()
    return painter.canvas


def encode_png(image: Image.Image) -> bytes:
    """PNG bytes; a full-colour card over ``MAX_BYTES`` is quantized to a 256-colour palette."""
    flat = image.convert("RGB")
    for candidate in (flat, flat.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)):
        buffer = io.BytesIO()
        candidate.save(buffer, format="PNG", optimize=True)
        if buffer.tell() <= cfg.MAX_BYTES:
            return buffer.getvalue()
    raise ValueError(f"Guild preview card is {buffer.tell()} bytes, over the {cfg.MAX_BYTES}-byte limit")
