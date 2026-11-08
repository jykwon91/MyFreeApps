/** `find_places` — the World Map's place search (`findPlaces`): zones, cities, towns, buildings. */
import { levelRange } from "@/games/wow-forever/lib/ask/levelRange";
import { ASK_CARD } from "@/games/wow-forever/data/ask/askCardKinds";
import { ASK_LIMITS } from "@/games/wow-forever/data/ask/askLimits";
import { ASK_TOOL } from "@/games/wow-forever/data/ask/askTools";
import type { AskPlaceRow } from "@/games/wow-forever/types/ask/askPlaceRow";
import type { AskQueryInput } from "@/games/wow-forever/types/ask/askQueryInput";
import type { AskToolData } from "@/games/wow-forever/types/ask/askToolData";
import type { AskToolOutcome } from "@/games/wow-forever/types/ask/askToolOutcome";
import type { WorldMapData } from "@/games/wow-forever/types/worldMap";
import { findPlaces, placeLabel, type Place } from "@/games/wow-forever/worldMap/places";

function levelsOf(place: Place, world: WorldMapData): string | null {
  const levels = world.zoneById.get(place.zoneId)?.levels;
  return levels === undefined ? null : levelRange(levels[0], levels[1]);
}

function row(place: Place, world: WorldMapData): AskPlaceRow {
  return {
    placeId: place.id,
    name: place.name,
    kind: place.kind,
    label: placeLabel(place),
    zoneId: place.zoneId,
    levels: levelsOf(place, world),
  };
}

export function findPlacesTool(input: AskQueryInput, data: AskToolData): AskToolOutcome {
  const rows = findPlaces(input.query, data.places, ASK_LIMITS.cardRows).map((p) => row(p, data.world));
  const result = {
    results: rows.map((r) => ({ name: r.name, kind: r.kind, where: r.label, levels: r.levels })),
  };
  const card: AskToolOutcome["card"] = rows.length
    ? { kind: ASK_CARD.places, query: input.query, rows }
    : { kind: ASK_CARD.noResults, tool: ASK_TOOL.findPlaces, query: input.query };
  return { content: JSON.stringify(result), isError: false, card };
}
