/**
 * `search_npcs` — the World Map's own "Show all on the map" search
 * (`searchAllNpcs` + `viewMapSearch`), nearest first from where the player said
 * they are (else their saved location), cut to the card's rows.
 */
import { ASK_CARD } from "@/games/wow-forever/data/ask/askCardKinds";
import { ASK_FACTION_LABEL } from "@/games/wow-forever/data/ask/askFactionLabels";
import { ASK_LIMITS } from "@/games/wow-forever/data/ask/askLimits";
import { ASK_FACTION_FILTER, ASK_TOOL } from "@/games/wow-forever/data/ask/askTools";
import { originFromMessage, originLocation, savedOrigin } from "@/games/wow-forever/lib/ask/resolveAskOrigin";
import type { AskFactionFilter } from "@/games/wow-forever/types/ask/askFactionFilter";
import type { AskNpcRow } from "@/games/wow-forever/types/ask/askNpcRow";
import type { AskNpcSearchInput } from "@/games/wow-forever/types/ask/askNpcSearchInput";
import type { AskOrigin } from "@/games/wow-forever/types/ask/askOrigin";
import type { AskToolData } from "@/games/wow-forever/types/ask/askToolData";
import type { AskToolOutcome } from "@/games/wow-forever/types/ask/askToolOutcome";
import { FACTION, type PlayerFaction, type WorldMapData } from "@/games/wow-forever/types/worldMap";
import { areaLabel, distanceLabel } from "@/games/wow-forever/worldMap/describeRank";
import { viewMapSearch } from "@/games/wow-forever/worldMap/mapSearch";
import { usableBy, type RankedPoi } from "@/games/wow-forever/worldMap/nearest";
import { searchAllNpcs } from "@/games/wow-forever/worldMap/search";

const SIDE: Readonly<Record<AskFactionFilter, PlayerFaction | null>> = {
  [ASK_FACTION_FILTER.alliance]: FACTION.alliance,
  [ASK_FACTION_FILTER.horde]: FACTION.horde,
  [ASK_FACTION_FILTER.any]: null,
};

function row(ranked: RankedPoi, n: number, world: WorldMapData): AskNpcRow {
  const { poi, zone } = ranked;
  return {
    n,
    poiId: poi.id,
    name: poi.name,
    title: poi.title,
    zoneId: zone.id,
    zoneName: zone.name,
    area: areaLabel(poi, zone),
    x: poi.x,
    y: poi.y,
    faction: poi.faction,
    distance: distanceLabel(ranked, world),
    source: poi.source,
    ...(poi.capturedAt === undefined ? {} : { capturedAt: poi.capturedAt }),
  };
}

function originNote(origin: AskOrigin | null): { place: string; source: string } | null {
  if (origin === null) return null;
  return { place: origin.label, source: origin.fromMessage ? "player's message" : "saved location" };
}

export function searchNpcsTool(input: AskNpcSearchInput, data: AskToolData): AskToolOutcome {
  const { world, places, player } = data;
  const named = input.fromZone === null ? null : originFromMessage(input.fromZone, places);
  // A place the map doesn't know is never swapped for the saved one: nearest from nowhere instead.
  const origin = input.fromZone === null ? savedOrigin(player, world) : named;
  const location = originLocation(origin, world);
  const faction = (input.faction === null ? null : SIDE[input.faction]) ?? player.faction;
  const everyone = input.faction === ASK_FACTION_FILTER.any;

  const hits = searchAllNpcs(input.query, world, { faction, player: location });
  const view = viewMapSearch({ query: input.query, hits }, world, faction, location, everyone);
  const otherFaction = !everyone && hits.length > 0 && !hits.some((h) => usableBy(h.poi, faction, false));
  const rows = view.results.slice(0, Math.min(input.limit, ASK_LIMITS.cardRows)).map((r, i) => row(r, i + 1, world));

  const result = {
    from: originNote(origin),
    ...(input.fromZone !== null && named === null ? { unknown_place: input.fromZone } : {}),
    faction: ASK_FACTION_LABEL[faction],
    results: rows.map((r) => ({
      n: r.n,
      name: r.name,
      title: r.title,
      area: r.area,
      faction: ASK_FACTION_LABEL[r.faction],
      distance: r.distance,
    })),
    total: view.results.length,
    other_faction_only: otherFaction,
  };
  const card: AskToolOutcome["card"] = rows.length
    ? { kind: ASK_CARD.npcs, query: input.query, origin, rows, total: view.results.length, otherFaction }
    : { kind: ASK_CARD.noResults, tool: ASK_TOOL.searchNpcs, query: input.query };
  return { content: JSON.stringify(result), isError: false, card };
}
