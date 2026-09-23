"""Zone map art + sub-zone lookup from the client's world-map textures.

A Classic-style zone map is a parchment base layer (``UiMapArtTile``) plus one
"explored area" overlay per sub-zone (``WorldMapOverlay`` +
``WorldMapOverlayTile``), each tagged with its ``AreaTable`` id. Compositing
every overlay gives the fully-explored map. The overlay's alpha channel also
tells us which sub-zone a map point is in (Goldshire, Kharanos, ...).
"""
from __future__ import annotations

import io
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING

from scripts.wow_world_map import sources

if TYPE_CHECKING:
    from PIL.Image import Image

# The client's world-map layer: 1002x668 drawn from a 4x3 grid of 256px tiles.
MAP_WIDTH = 1002
MAP_HEIGHT = 668
TILE = 256
WEBP_QUALITY = 70
# Overlay pixels at least this opaque count as "inside" the sub-zone.
ALPHA_INSIDE = 128


@dataclass
class _Overlay:
    area_name: str
    left: int
    top: int
    image: "Image"  # RGBA, TextureWidth x TextureHeight

    def covers(self, px: int, py: int) -> bool:
        lx, ly = px - self.left, py - self.top
        if not (0 <= lx < self.image.width and 0 <= ly < self.image.height):
            return False
        alpha = self.image.getpixel((lx, ly))[3]  # type: ignore[index]
        return int(alpha) >= ALPHA_INSIDE

    @property
    def area(self) -> int:
        return self.image.width * self.image.height


def _stitch(tiles: list[dict[str, str]], width: int, height: int, mode: str) -> "Image":
    from PIL import Image  # generator-only dependency (Pillow, via qrcode[pil])

    cols = max(int(t["ColIndex"]) for t in tiles) + 1
    rows = max(int(t["RowIndex"]) for t in tiles) + 1
    canvas = Image.new(mode, (cols * TILE, rows * TILE))
    for tile in tiles:
        img = Image.open(io.BytesIO(sources.wago_file(int(tile["FileDataID"])))).convert(mode)
        canvas.paste(img, (int(tile["ColIndex"]) * TILE, int(tile["RowIndex"]) * TILE))
    return canvas.crop((0, 0, width, height))


class WorldMapArt:
    """Lazily stitches each map's art; answers sub-zone lookups."""

    def __init__(self) -> None:
        self._art_for_map = {
            int(r["UiMapID"]): int(r["UiMapArtID"]) for r in sources.wago_table("UiMapXMapArt")
        }
        self._base_tiles: dict[int, list[dict[str, str]]] = {}
        for row in sources.wago_table("UiMapArtTile"):
            if row["LayerIndex"] == "0":
                self._base_tiles.setdefault(int(row["UiMapArtID"]), []).append(row)
        self._overlay_rows: dict[int, list[dict[str, str]]] = {}
        for row in sources.wago_table("WorldMapOverlay"):
            self._overlay_rows.setdefault(int(row["UiMapArtID"]), []).append(row)
        self._overlay_tiles: dict[int, list[dict[str, str]]] = {}
        for row in sources.wago_table("WorldMapOverlayTile"):
            if row["LayerIndex"] == "0":
                self._overlay_tiles.setdefault(int(row["WorldMapOverlayID"]), []).append(row)
        self._area_names = {
            int(r["ID"]): r["AreaName_lang"].strip() for r in sources.wago_table("AreaTable")
        }
        self._overlays: dict[int, list[_Overlay]] = {}

    def _overlays_for(self, ui_map_id: int) -> list[_Overlay]:
        if ui_map_id in self._overlays:
            return self._overlays[ui_map_id]
        overlays: list[_Overlay] = []
        for row in self._overlay_rows.get(self._art_for_map.get(ui_map_id, -1), []):
            tiles = self._overlay_tiles.get(int(row["ID"]))
            if not tiles:
                continue
            image = _stitch(tiles, int(row["TextureWidth"]), int(row["TextureHeight"]), "RGBA")
            area_ids = [int(row[f"AreaID_{i}"]) for i in range(4) if int(row[f"AreaID_{i}"])]
            name = self._area_names.get(area_ids[0], "") if area_ids else ""
            overlays.append(_Overlay(name, int(row["OffsetX"]), int(row["OffsetY"]), image))
        self._overlays[ui_map_id] = overlays
        return overlays

    def subzone(self, ui_map_id: int, x_pct: float, y_pct: float) -> str:
        """Name of the explored area drawn under a map point, or ``""``."""
        px = int(x_pct / 100 * MAP_WIDTH)
        py = int(y_pct / 100 * MAP_HEIGHT)
        hits = [o for o in self._overlays_for(ui_map_id) if o.area_name and o.covers(px, py)]
        if not hits:
            return ""
        return min(hits, key=lambda o: o.area).area_name

    def render(self, ui_map_id: int, out_dir: Path) -> bool:
        """Write the fully-explored map to ``<out_dir>/<uiMapId>.webp``."""
        base = self._base_tiles.get(self._art_for_map.get(ui_map_id, -1))
        if not base:
            return False
        canvas = _stitch(base, MAP_WIDTH, MAP_HEIGHT, "RGBA")
        for overlay in self._overlays_for(ui_map_id):
            canvas.alpha_composite(overlay.image, (overlay.left, overlay.top))
        out_dir.mkdir(parents=True, exist_ok=True)
        canvas.convert("RGB").save(out_dir / f"{ui_map_id}.webp", "WEBP", quality=WEBP_QUALITY, method=6)
        return True
