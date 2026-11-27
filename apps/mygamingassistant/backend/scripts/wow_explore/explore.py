"""The areas the Legacy "Explorer" challenge counts, for the MGA Explorer addon (pure).

Explore Azeroth (achievement 62053) = Explore Eastern Kingdoms + Explore
Kalimdor. Everything below is read from the Forever client's tables:

* **Zones**: the continent achievements' ``CriteriaTree`` children are
  ``Criteria`` of type 8 ("complete achievement"), each the zone's own
  "Explore <Zone>" achievement. Whatever those trees list is what counts, so
  Forever's Riverglades, Mount Hyjal and Shen'dralas are in when they are.
* **Areas**: a zone achievement's children are ``Criteria`` of type 43
  ("explore area"), each naming a ``WorldMapOverlay`` (the patch of map a
  discovery uncovers). The area's name is the criteria tree's own text.
* **Zone map**: an achievement overlay can sit on an older map art than the
  one the zone shows now, so the zone's map is the one whose current art
  (``UiMapXMapArt``) has an overlay for the same ``AreaTable`` id. Every area
  of a zone must land on the same map.
* **Rect**: the patch of the zone map the area covers, in percent (left, top,
  right, bottom): the hit rect of the overlay the zone's current art draws for
  it (its texture rect when the hit rect is empty), over the 1002x668 map
  layer. An area today's art doesn't draw keeps its achievement overlay's rect.
* **Spot**: where on the zone map to send you, in percent. The World Map's
  own ``areas.json`` spot for that name on that map when it lies inside the
  rect (a walk patch on the area's ground: ``ground``), else the middle of the
  rect (``map``). About one walk spot in nine sits outside its area's rect
  (all of Eastern Plaguelands' sit up and left of them), and the rect is
  where the map draws the area, so the rect wins.
* **Texture**: the offset of the overlay the zone's current art draws for the
  area, so the addon can match ``C_MapExplorationInfo.GetExploredMapTextures``
  when the achievement API can't be read.
"""
from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass

from scripts.wow_world_map.map_art import MAP_HEIGHT, MAP_WIDTH

Row = Mapping[str, str]

EXPLORE_AZEROTH = 62053
# Criteria.Type: "complete this achievement" and "explore this map overlay".
COMPLETE_ACHIEVEMENT = 8
EXPLORE_AREA = 43
EXPLORE_PREFIX = "Explore "
AREA_ID_COLUMNS = ("AreaID_0", "AreaID_1", "AreaID_2", "AreaID_3")


@dataclass(frozen=True)
class Area:
    criteria: int
    overlay: int
    name: str
    x: float
    y: float
    spot: str
    rect: tuple[float, float, float, float]
    texture: tuple[int, int] | None

    def as_doc(self) -> dict[str, object]:
        return {
            "criteria": self.criteria,
            "overlay": self.overlay,
            "name": self.name,
            "x": self.x,
            "y": self.y,
            "spot": self.spot,
            "rect": list(self.rect),
            "texture": list(self.texture) if self.texture else None,
        }


@dataclass(frozen=True)
class Zone:
    achievement: int
    name: str
    map: int
    areas: tuple[Area, ...]

    def as_doc(self) -> dict[str, object]:
        return {
            "achievement": self.achievement,
            "name": self.name,
            "map": self.map,
            "areas": [a.as_doc() for a in self.areas],
        }


@dataclass(frozen=True)
class Continent:
    achievement: int
    name: str
    continent: int
    zones: tuple[Zone, ...]

    def as_doc(self) -> dict[str, object]:
        return {
            "achievement": self.achievement,
            "name": self.name,
            "continent": self.continent,
            "zones": [z.as_doc() for z in self.zones],
        }


def _int(value: str | None) -> int:
    return int(value or 0)


def tree_children(tree_rows: Iterable[Row]) -> dict[int, list[Row]]:
    """CriteriaTree rows by parent, in the game's order."""
    children: dict[int, list[Row]] = {}
    for row in tree_rows:
        children.setdefault(_int(row["Parent"]), []).append(row)
    for rows in children.values():
        rows.sort(key=lambda r: (_int(r["OrderIndex"]), _int(r["ID"])))
    return children


def leaf_criteria(tree: int, children: Mapping[int, list[Row]]) -> list[Row]:
    """The tree rows under ``tree`` that name a criteria; a row with none is a sub-tree, walked in place."""
    found: list[Row] = []
    for row in children.get(tree, []):
        if _int(row["CriteriaID"]):
            found.append(row)
        else:
            found.extend(leaf_criteria(_int(row["ID"]), children))
    return found


def _criteria_of(row: Row, criteria: Mapping[int, Row], want_type: int, owner: str) -> int:
    crit = criteria.get(_int(row["CriteriaID"]))
    if crit is None:
        raise SystemExit(f"{owner}: criteria {row['CriteriaID']} is missing from Criteria.")
    if _int(crit["Type"]) != want_type:
        raise SystemExit(
            f"{owner}: criteria {crit['ID']} ({row['Description_lang']!r}) is type {crit['Type']}, not {want_type}. "
            "The Explorer data assumes continents list zone achievements and zones list map overlays."
        )
    return _int(crit["Asset"])


def area_ids(overlay: Row) -> list[int]:
    return [_int(overlay[c]) for c in AREA_ID_COLUMNS if _int(overlay.get(c))]


def current_overlays(overlays: Iterable[Row], art_to_map: Mapping[int, int]) -> dict[int, list[tuple[int, Row]]]:
    """``AreaTable`` id -> (zone map, overlay) for every overlay on a map's current art."""
    found: dict[int, list[tuple[int, Row]]] = {}
    for overlay in overlays:
        ui_map = art_to_map.get(_int(overlay["UiMapArtID"]))
        if ui_map is None:
            continue
        for area in area_ids(overlay):
            found.setdefault(area, []).append((ui_map, overlay))
    return found


def _pixel_rect(overlay: Row) -> tuple[float, float, float, float]:
    """An overlay's hit rect in map-layer pixels (left, top, right, bottom), or its texture rect when that is empty."""
    left, right = float(overlay["HitRectLeft"]), float(overlay["HitRectRight"])
    top, bottom = float(overlay["HitRectTop"]), float(overlay["HitRectBottom"])
    if right <= left or bottom <= top:
        left = float(overlay["OffsetX"])
        right = left + float(overlay["TextureWidth"])
        top = float(overlay["OffsetY"])
        bottom = top + float(overlay["TextureHeight"])
    return left, top, right, bottom


def overlay_rect(overlay: Row) -> tuple[float, float, float, float]:
    """An overlay's hit rect (or texture rect) in percent of the zone map: left, top, right, bottom."""
    left, top, right, bottom = _pixel_rect(overlay)
    return (
        round(left / MAP_WIDTH * 100, 1), round(top / MAP_HEIGHT * 100, 1),
        round(right / MAP_WIDTH * 100, 1), round(bottom / MAP_HEIGHT * 100, 1),
    )


def overlay_centre(overlay: Row) -> tuple[float, float]:
    """The middle of an overlay in percent of the zone map: its hit rect, or its texture rect when that is empty."""
    left, top, right, bottom = _pixel_rect(overlay)
    return round((left + right) / 2 / MAP_WIDTH * 100, 1), round((top + bottom) / 2 / MAP_HEIGHT * 100, 1)


def inside(spot: tuple[float, float], rect: tuple[float, float, float, float]) -> bool:
    return rect[0] <= spot[0] <= rect[2] and rect[1] <= spot[1] <= rect[3]


def zone_map(name: str, overlays: list[Row], current: Mapping[int, list[tuple[int, Row]]],
             art_to_map: Mapping[int, int]) -> int:
    """The one zone map every placed area of the zone is on.

    An area on a zone border can be on two maps; an area today's art doesn't draw (a city inside the
    zone, a spot Forever's art dropped) is on none and doesn't vote.
    """
    common: set[int] | None = None
    for overlay in overlays:
        own = art_to_map.get(_int(overlay["UiMapArtID"]))
        maps = {own} if own is not None else {m for a in area_ids(overlay) for m, _ in current.get(a, [])}
        if maps:
            common = maps if common is None else common & maps
    if not common or len(common) != 1:
        raise SystemExit(f"{name}: its areas share {sorted(common or [])} zone maps, expected exactly one.")
    return common.pop()


def current_overlay(overlay: Row, ui_map: int, current: Mapping[int, list[tuple[int, Row]]]) -> Row | None:
    """The overlay the zone map's current art draws for the same area, or None when it draws none."""
    for area in area_ids(overlay):
        for found_map, found in current.get(area, []):
            if found_map == ui_map:
                return found
    return None


def zone_name(achievement: Row) -> str:
    title = achievement["Title_lang"].strip()
    if not title.startswith(EXPLORE_PREFIX):
        raise SystemExit(f"Achievement {achievement['ID']} ({title!r}) isn't an 'Explore …' achievement.")
    return title[len(EXPLORE_PREFIX):]


def build_zone(
    achievement_id: int,
    achievements: Mapping[int, Row],
    children: Mapping[int, list[Row]],
    criteria: Mapping[int, Row],
    overlays: Mapping[int, Row],
    current: Mapping[int, list[tuple[int, Row]]],
    art_to_map: Mapping[int, int],
    ground: Mapping[tuple[str, int], tuple[float, float]],
) -> Zone:
    achievement = achievements.get(achievement_id)
    if achievement is None:
        raise SystemExit(f"Zone achievement {achievement_id} is missing from Achievement.")
    name = zone_name(achievement)
    rows = leaf_criteria(_int(achievement["Criteria_tree"]), children)
    if not rows:
        raise SystemExit(f"{name}: its achievement lists no areas.")
    picked: list[tuple[Row, int, Row]] = []
    for row in rows:
        overlay_id = _criteria_of(row, criteria, EXPLORE_AREA, name)
        overlay = overlays.get(overlay_id)
        if overlay is None:
            raise SystemExit(f"{name}: WorldMapOverlay {overlay_id} ({row['Description_lang']!r}) is missing.")
        picked.append((row, overlay_id, overlay))
    ui_map = zone_map(name, [o for _, _, o in picked], current, art_to_map)
    areas = []
    for row, overlay_id, overlay in picked:
        area_name = row["Description_lang"].strip()
        drawn = current_overlay(overlay, ui_map, current)
        shape = drawn or overlay
        rect = overlay_rect(shape)
        spot = ground.get((area_name, ui_map))
        if spot and not inside(spot, rect):
            spot = None
        x, y = spot if spot else overlay_centre(shape)
        areas.append(Area(
            criteria=_int(row["CriteriaID"]),
            overlay=overlay_id,
            name=area_name,
            x=x,
            y=y,
            spot="ground" if spot else "map",
            rect=rect,
            texture=(_int(drawn["OffsetX"]), _int(drawn["OffsetY"])) if drawn else None,
        ))
    return Zone(achievement=achievement_id, name=name, map=ui_map, areas=tuple(areas))


def build_continents(
    tables: Mapping[str, Iterable[Row]],
    zone_continents: Mapping[int, int],
    ground: Mapping[tuple[str, int], tuple[float, float]],
) -> tuple[str, list[Continent]]:
    """(Explore Azeroth's title, its continents) from Achievement, CriteriaTree, Criteria, WorldMapOverlay, UiMapXMapArt."""
    achievements = {_int(r["ID"]): r for r in tables["Achievement"]}
    children = tree_children(tables["CriteriaTree"])
    criteria = {_int(r["ID"]): r for r in tables["Criteria"]}
    overlay_rows = list(tables["WorldMapOverlay"])
    overlays = {_int(r["ID"]): r for r in overlay_rows}
    art_to_map = {_int(r["UiMapArtID"]): _int(r["UiMapID"]) for r in tables["UiMapXMapArt"]}
    current = current_overlays(overlay_rows, art_to_map)
    root = achievements.get(EXPLORE_AZEROTH)
    if root is None:
        raise SystemExit(f"Explore Azeroth ({EXPLORE_AZEROTH}) is missing from Achievement.")
    continents = []
    for row in leaf_criteria(_int(root["Criteria_tree"]), children):
        continent_id = _criteria_of(row, criteria, COMPLETE_ACHIEVEMENT, root["Title_lang"])
        continent = achievements.get(continent_id)
        if continent is None:
            raise SystemExit(f"Continent achievement {continent_id} is missing from Achievement.")
        zones = []
        for zone_row in leaf_criteria(_int(continent["Criteria_tree"]), children):
            zone_id = _criteria_of(zone_row, criteria, COMPLETE_ACHIEVEMENT, continent["Title_lang"])
            zones.append(build_zone(zone_id, achievements, children, criteria, overlays, current, art_to_map, ground))
        on = {zone_continents.get(z.map) for z in zones}
        only = on.pop() if len(on) == 1 else None
        if only is None:
            raise SystemExit(f"{continent['Title_lang']}: its zones sit on continents {on or {None}}, expected exactly one.")
        continents.append(Continent(
            achievement=continent_id,
            name=continent["Title_lang"].strip(),
            continent=only,
            zones=tuple(zones),
        ))
    if not continents:
        raise SystemExit("Explore Azeroth lists no continents.")
    return root["Title_lang"].strip(), continents
