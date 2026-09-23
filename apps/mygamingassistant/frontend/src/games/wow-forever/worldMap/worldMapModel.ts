/**
 * Everything the World Map page shows, derived from the data + the player's
 * choices. Pure, so the page stays a thin view and this is unit-tested.
 */
import type { WowClassId } from "@/games/wow-forever/data/classes";
import type { PlayerFaction, QuestInfo, WorldMapData, WorldZone } from "@/games/wow-forever/types/worldMap";
import { questsFor } from "@/games/wow-forever/worldMap/levels";
import { poiRouteEnd } from "@/games/wow-forever/worldMap/describeRank";
import { planDirections, type Directions, type RouteEnd } from "@/games/wow-forever/worldMap/directions";
import { zoneToWorld } from "@/games/wow-forever/worldMap/geometry";
import { rankPois, usableBy, type PlayerLocation, type RankedPoi } from "@/games/wow-forever/worldMap/nearest";
import { findFilter, heroFilters, type ServiceFilter } from "@/games/wow-forever/worldMap/serviceFilters";

export const ZONE_CENTRE = { x: 50, y: 50 } as const;

export interface WorldMapChoices {
  faction: PlayerFaction;
  classId: WowClassId;
  zoneId: number | null;
  level: number | null;
  position: { x: number; y: number } | null;
  findFilterId: string;
  showAllClasses: boolean;
  includeOtherFaction: boolean;
  selectedPoiId: string | null;
}

export interface RankedQuestGiver {
  ranked: RankedPoi;
  quests: QuestInfo[];
}

export interface HeroRow {
  filter: ServiceFilter;
  best: RankedPoi | null;
}

export interface WorldMapModel {
  zone: WorldZone;
  player: PlayerLocation;
  playerEnd: RouteEnd;
  usingZoneCentre: boolean;
  hero: HeroRow[];
  findFilter: ServiceFilter;
  findResults: RankedPoi[];
  /** Nearest quest givers with a quest this player could take (level rules applied). */
  questGivers: RankedQuestGiver[];
  /** Every dungeon and raid entrance, nearest first. */
  instances: RankedPoi[];
  selected: RankedPoi | null;
  /** null = no known route; undefined = nothing selected. */
  directions: Directions | null | undefined;
}

/** null until the player has picked a zone that exists in the data. */
export function buildWorldMapModel(data: WorldMapData, choices: WorldMapChoices): WorldMapModel | null {
  const zone = choices.zoneId === null ? undefined : data.zoneById.get(choices.zoneId);
  if (!zone) return null;
  const position = choices.position ?? ZONE_CENTRE;
  const player: PlayerLocation = { zone, world: zoneToWorld(zone, position.x, position.y) };
  const playerEnd: RouteEnd = {
    world: player.world,
    place: { label: "your position", zoneId: zone.id, zoneName: zone.name, subzone: "", x: position.x, y: position.y },
  };

  const ownSide = data.pois.filter((p) => usableBy(p, choices.faction, false));
  const hero = heroFilters(choices.classId).map((filter) => ({
    filter,
    best: rankPois(ownSide.filter((p) => filter.matches(p, false)), player, data)[0] ?? null,
  }));

  const activeFilter = findFilter(choices.classId, choices.findFilterId);
  const findResults = rankPois(
    data.pois.filter(
      (p) => usableBy(p, choices.faction, choices.includeOtherFaction) && activeFilter.matches(p, choices.showAllClasses),
    ),
    player,
    data,
  );

  const questGivers = rankPois(
    data.questGivers.filter((p) => usableBy(p, choices.faction, false)),
    player,
    data,
  ).flatMap((ranked) => {
    const quests = questsFor(ranked.poi.quests ?? [], choices.faction, choices.classId, choices.level);
    return quests.length ? [{ ranked, quests }] : [];
  });
  const instances = rankPois(data.instances, player, data);

  const selectedPoi = choices.selectedPoiId ? data.poiById.get(choices.selectedPoiId) : undefined;
  const selected = selectedPoi ? (rankPois([selectedPoi], player, data)[0] ?? null) : null;
  let directions: Directions | null | undefined;
  if (selected) directions = planDirections(playerEnd, poiRouteEnd(selected), choices.faction, data);

  return {
    zone,
    player,
    playerEnd,
    usingZoneCentre: choices.position === null,
    hero,
    findFilter: activeFilter,
    findResults,
    questGivers,
    instances,
    selected,
    directions,
  };
}
