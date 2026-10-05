"""Where the roads are: the ground painted with a zone's road texture.

A terrain chunk (33 yd) is painted with up to four textures (``MCLY`` layers
in the tile's ``tex0`` file); each layer above the first has a 64x64 alpha
map (``MCAL``) and is blended over the ones below it. A zone's roads are one
of its own textures — Desolace's are ``desolacecracks``, not anything named
"road" — so :data:`ROAD_TEXTURES` lists them by hand, each checked by
rendering it over the zone's map art (``python -m
scripts.wow_world_map.walk.roads <zone>``) and seeing it trace the roads the
map draws.

The navmesh carves road quads out as their own area (``geometry.py``), so
its polygons split along a road's edges, and the walk graph prefers them
(``clusters.OFFROAD_FACTOR``).

A terrain quad (4 yd, the outer height grid's spacing) is road when road
textures make up at least :data:`ROAD_WEIGHT` of it. Specks of road texture
used as decoration (cracked ground in a camp) are dropped: only road joined
into a stretch of at least :data:`MIN_ROAD_CELLS` quads counts.
"""
from __future__ import annotations

import struct
import sys
from collections.abc import Iterable

import numpy as np

from scripts.wow_world_map.walk import terrain
from scripts.wow_world_map.walk.client_files import chunk_map, chunks, client_file, prefetch
from scripts.wow_world_map.walk.terrain import CHUNK_SIZE, MAP_ORIGIN, TileFiles

CELL = CHUNK_SIZE / 8.0  # a terrain quad, ~4.2 yd
ALPHA_CELLS = 64  # an alpha map's side, per chunk
ROAD_WEIGHT = 0.4
MIN_ROAD_CELLS = 60  # ~1,000 yd² of road: a stretch, not a speck
MPHD_BIG_ALPHA = 0x4 | 0x80  # 8-bit alpha maps (big alpha / height texturing)
MCLY_USE_ALPHA = 0x100
MCLY_COMPRESSED = 0x200

# FileDataID -> texture (tileset/..._s): the textures roads are painted with.
# Most are named for it; the rest were picked by eye (``# by eye``). Left
# out: ``burningstepps/burningsteppsbrick01`` (the ruins at Ahn'Qiraj's
# gate), the Dragonblight / Gilneas road textures (stray patches of later
# expansions' art). Badlands, Searing Gorge, Thousand Needles, Tanaris,
# Un'Goro and Silithus paint their trails with their base dirt: no roads.
ROAD_TEXTURES: dict[int, str] = {
    186766: "aerie peaks/aeriepeaksrockroadbase",
    186802: "alteracmtns/alteracrockroadbase",
    186839: "ashenvale/ashenvaleroad",
    186883: "ashzara/ashzararoad",
    186918: "barrens/barrensroad01",
    186962: "burningstepps/burningsteppsspireroad01",
    186975: "darkshore/darkshoreroad",
    187000: "desolace/desolacecracks",  # by eye: Desolace's roads
    187035: "durotar/durotarroad",
    187066: "duskwallow marsh/duskwallowstoneroad",
    187073: "duskwood/duskwoodcobblestone2",
    187074: "duskwood/duskwoodcobblestone",
    187100: "elwynn/elwynncobblestonebase",
    187104: "elwynn/elwynncobblestonedock",
    187106: "elwynn/elwynncobblestonedockdirt",
    188478: "felwood/felwoodroad",
    188508: "feralas/feralasroad",
    188542: "hyjal/alphahyjalroad",
    188566: "ironforge/ironforgerock06road2",
    188572: "ironforge/ironforgerock09browncracks",  # by eye: Dun Morogh's main road
    188584: "kalidar/kalidardarnroad",
    188598: "kalidar/kalidarroad",
    188610: "loch modan/lochmodanbrickroadbase",
    188665: "mullgore/mullgoreroad01",
    188727: "plaguelandseast/eastplaguedroadbase",
    188763: "redridge/redridgerockroadbase",
    188796: "silverpine/silverpineroad",
    188818: "stranglethorn/stranglethorncobblestoneroad",
    188854: "swamp of sorrows/swampsorrowsstoneroad07",
    188911: "the blasted lands/blastedlandsroad",
    188964: "tirisfall/tirisfallstoneroad01",
    188982: "westwood/westfallcobblestonebase",
    189026: "wetlands/wetlandsroad01",
    189071: "zulgurub/zulgurubroad01",
    365792: "orgrimmar/orgrim_road_01",
}


def big_alpha(wdt_file_data_id: int) -> bool:
    (flags,) = struct.unpack_from("<I", chunk_map(client_file(wdt_file_data_id))["MPHD"], 0)
    return bool(flags & MPHD_BIG_ALPHA)


def _alpha(mcal: bytes, offset: int, compressed: bool, big: bool) -> np.ndarray:
    """One layer's 64x64 alpha map, 0..1."""
    if compressed:  # run-length: a byte's top bit = fill (repeat the next byte), else copy
        out = bytearray()
        i = offset
        while len(out) < ALPHA_CELLS * ALPHA_CELLS:
            head = mcal[i]
            count = head & 0x7F
            if head & 0x80:
                out += bytes([mcal[i + 1]]) * count
                i += 2
            else:
                out += mcal[i + 1:i + 1 + count]
                i += 1 + count
        a = np.frombuffer(bytes(out[:4096]), dtype=np.uint8)
    elif big:
        a = np.frombuffer(mcal, dtype=np.uint8, count=4096, offset=offset)
    else:  # 4-bit, low nibble first
        raw = np.frombuffer(mcal, dtype=np.uint8, count=2048, offset=offset)
        a = np.empty(4096, dtype=np.uint8)
        a[0::2], a[1::2] = (raw & 0xF) * 17, (raw >> 4) * 17
    return a.reshape(ALPHA_CELLS, ALPHA_CELLS).astype(np.float32) / 255.0


def chunk_textures(tex0: bytes, big: bool) -> list[list[tuple[int, np.ndarray]]]:
    """Per chunk (in the tile's MCNK order): each texture's FileDataID and its
    64x64 share of the ground after blending (a layer covers those below it)."""
    mdid = chunk_map(tex0).get("MDID", b"")
    textures = struct.unpack(f"<{len(mdid) // 4}I", mdid)
    out = []
    for data in (d for tag, d in chunks(tex0) if tag == "MCNK"):
        sub = chunk_map(data)
        mcly, mcal = sub.get("MCLY", b""), sub.get("MCAL", b"")
        layers = [struct.unpack_from("<3I", mcly, k * 16) for k in range(len(mcly) // 16)]
        alphas = [np.ones((ALPHA_CELLS, ALPHA_CELLS), dtype=np.float32)]
        for _, flags, offset in layers[1:]:
            alphas.append(_alpha(mcal, offset, bool(flags & MCLY_COMPRESSED), big) if flags & MCLY_USE_ALPHA
                          else np.zeros((ALPHA_CELLS, ALPHA_CELLS), dtype=np.float32))
        shares: list[tuple[int, np.ndarray]] = []
        above = np.ones((ALPHA_CELLS, ALPHA_CELLS), dtype=np.float32)
        for (texture, _, _), a in reversed(list(zip(layers, alphas))):
            shares.append((textures[texture], a * above))
            above = above * (1 - a)
        out.append(shares[::-1])
    return out


def _quads(share: np.ndarray) -> np.ndarray:
    """64x64 alpha cells -> the chunk's 8x8 quads (mean)."""
    return share.reshape(8, 8, 8, 8).mean(axis=(1, 3))


def texture_quads(tiles: Iterable[TileFiles], big: bool,
                  wanted: set[int] | None = None) -> dict[int, dict[tuple[int, int], float]]:
    """Each texture's share of every quad it paints: ``{fid: {(row, col): share}}``."""
    tiles = [t for t in tiles if t.root and t.tex0]
    prefetch(t.tex0 for t in tiles)
    out: dict[int, dict[tuple[int, int], float]] = {}
    for tile in tiles:
        corners = terrain.chunk_areas(client_file(tile.root))
        for (north, west, _), shares in zip(corners, chunk_textures(client_file(tile.tex0), big)):
            r0 = round((MAP_ORIGIN - north) / CHUNK_SIZE) * 8
            c0 = round((MAP_ORIGIN - west) / CHUNK_SIZE) * 8
            for fid, share in shares:
                if wanted is not None and fid not in wanted:
                    continue
                q = _quads(share)
                cells = out.setdefault(fid, {})
                for r, c in zip(*np.nonzero(q > 0.01)):
                    key = (r0 + int(r), c0 + int(c))
                    cells[key] = max(cells.get(key, 0.0), float(q[r, c]))
    return out


def _stretches(cells: set[tuple[int, int]], minimum: int) -> set[tuple[int, int]]:
    """The cells in 8-connected groups of at least ``minimum``."""
    seen: set[tuple[int, int]] = set()
    keep: set[tuple[int, int]] = set()
    for start in cells:
        if start in seen:
            continue
        group, stack = [start], [start]
        seen.add(start)
        while stack:
            r, c = stack.pop()
            for dr in (-1, 0, 1):
                for dc in (-1, 0, 1):
                    n = (r + dr, c + dc)
                    if n in cells and n not in seen:
                        seen.add(n)
                        group.append(n)
                        stack.append(n)
        if len(group) >= minimum:
            keep.update(group)
    return keep


def road_map(tiles: Iterable[TileFiles], wdt_file_data_id: int) -> frozenset[tuple[int, int]]:
    """The road quads, by global ``(row, col)``: row grows south, col east, a quad
    :data:`CELL` yards across from :data:`~terrain.MAP_ORIGIN`."""
    quads = texture_quads(tiles, big_alpha(wdt_file_data_id), set(ROAD_TEXTURES))
    share: dict[tuple[int, int], float] = {}
    for cells in quads.values():
        for key, s in cells.items():
            share[key] = share.get(key, 0.0) + s
    road = _stretches({k for k, s in share.items() if s >= ROAD_WEIGHT}, MIN_ROAD_CELLS)
    print(f"  road: {len(road)} quads ({len(road) * CELL * CELL:,.0f} yd²)")
    return frozenset(road)


# --- audit: python -m scripts.wow_world_map.walk.roads <zone> [fid ...] ----------
def _audit(zone_name: str, fids: list[int]) -> None:
    """Render road textures over a zone's map art, and rank the zone's textures
    by how road-like their shape is (thin: gone after a 5-quad erosion)."""
    from PIL import Image

    from scripts.wow_world_map import sources
    from scripts.wow_world_map.build import FRONTEND_DIR
    from scripts.wow_world_map.walk.build import wdt_ids
    from scripts.wow_world_map.zones import load_zones

    zone = next(z for z in load_zones()[1] if z.name == zone_name)
    wdt = wdt_ids()[zone.continent]
    tiles = [t for t in terrain.map_tiles(wdt)
             if MAP_ORIGIN - (t.row + 1) * 16 * CHUNK_SIZE <= zone.max_x and MAP_ORIGIN - t.row * 16 * CHUNK_SIZE >= zone.min_x
             and MAP_ORIGIN - (t.col + 1) * 16 * CHUNK_SIZE <= zone.max_y and MAP_ORIGIN - t.col * 16 * CHUNK_SIZE >= zone.min_y]
    quads = texture_quads(tiles, big_alpha(wdt))
    r0, c0 = int((MAP_ORIGIN - zone.max_x) / CELL), int((MAP_ORIGIN - zone.max_y) / CELL)
    h, w = int((zone.max_x - zone.min_x) / CELL) + 1, int((zone.max_y - zone.min_y) / CELL) + 1

    def raster(cells: dict[tuple[int, int], float]) -> np.ndarray:
        g = np.zeros((h, w), dtype=bool)
        for (r, c), s in cells.items():
            if s >= ROAD_WEIGHT and 0 <= r - r0 < h and 0 <= c - c0 < w:
                g[r - r0, c - c0] = True
        return g

    names = {}
    listfile = sources.CACHE_DIR / "tileset-listfile.csv"
    if listfile.exists():
        names = dict(line.split(";", 1) for line in listfile.read_text().splitlines())
    print(f"{'fid':>8} {'yd²':>9} thin  texture")
    for fid, cells in sorted(quads.items(), key=lambda kv: -len(kv[1])):
        g = raster(cells)
        if g.sum() < MIN_ROAD_CELLS:
            continue
        window = np.lib.stride_tricks.sliding_window_view(np.pad(g, 2), (5, 5))
        thin = 1 - window.all(axis=(2, 3)).sum() / g.sum()
        mark = " *" if fid in ROAD_TEXTURES else ""
        print(f"{fid:>8} {g.sum() * CELL * CELL:>9.0f} {thin:.2f}  {names.get(str(fid), '?')}{mark}")
    show = fids or [f for f in ROAD_TEXTURES if f in quads]
    art = Image.open(FRONTEND_DIR / "public" / "wow-maps" / f"{zone.ui_map_id}.webp").convert("RGB")
    mask = np.zeros((h, w), dtype=bool)
    for fid in show:
        mask |= raster(quads.get(fid, {}))
    overlay = Image.fromarray(mask.astype(np.uint8) * 200).resize(art.size, Image.BILINEAR)
    art.paste(Image.new("RGB", art.size, (255, 0, 0)), (0, 0), overlay)
    out = sources.CACHE_DIR / f"roads-{zone.ui_map_id}.png"
    art.save(out)
    print(f"road textures {show} over the map: {out}")


if __name__ == "__main__":
    _audit(sys.argv[1], [int(a) for a in sys.argv[2:]])
