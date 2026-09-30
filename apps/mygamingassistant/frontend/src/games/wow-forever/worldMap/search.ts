/**
 * The page search box: find an NPC, quest giver or dungeon by name — or by
 * what they are and where ("cooking trainer stormwind") — plus places.
 *
 * Every word typed must appear in the NPC's name, title, town, zone or type.
 * Best first: the name matches (exact, then starts with it), then NPCs your
 * faction can use, then the nearest, then A–Z.
 */
import { PROFESSION_LABEL, SERVICE_LABEL, isServiceKind } from "@/games/wow-forever/data/worldMap/serviceKinds";
import { ZONE_ALIASES } from "@/games/wow-forever/data/worldMap/placeNames";
import {
  POI_KIND,
  type MapPoi,
  type PlayerFaction,
  type WorldMapData,
  type WorldZone,
} from "@/games/wow-forever/types/worldMap";
import { yardsBetween, zoneToWorld } from "@/games/wow-forever/worldMap/geometry";
import { usableBy, type PlayerLocation } from "@/games/wow-forever/worldMap/nearest";
import { findPlaces, type Place } from "@/games/wow-forever/worldMap/places";
import { matchesAll, nameScore, normalizeText, queryTokens } from "@/games/wow-forever/worldMap/searchText";

export const MAX_NPC_RESULTS = 6;
export const MAX_PLACE_RESULTS = 3;

export interface NpcHit {
  poi: MapPoi;
  zone: WorldZone;
}

export interface MapSearchResults {
  npcs: NpcHit[];
  places: Place[];
}

export interface SearchContext {
  faction: PlayerFaction;
  /** Where the player is, for "nearest first"; null before they pick a zone. */
  player: PlayerLocation | null;
}

/** Words that describe what an NPC is, so "flight master" or "cooking trainer" find them. */
function kindWords(poi: MapPoi): string {
  if (poi.kind === POI_KIND.questGiver) return "quest giver quests";
  if (poi.kind === POI_KIND.instance) return `${poi.subkind} instance`;
  const words = [isServiceKind(poi.subkind) ? SERVICE_LABEL[poi.subkind] : "", "npc"];
  const profession = PROFESSION_LABEL[poi.tag];
  if (profession) words.push(`${profession} trainer`);
  else if (poi.tag) words.push(`${poi.tag} trainer`);
  return words.join(" ");
}

const haystacks = new WeakMap<MapPoi, string>();

function haystackFor(poi: MapPoi, zone: WorldZone): string {
  let text = haystacks.get(poi);
  if (text === undefined) {
    const aliases = (ZONE_ALIASES[zone.name] ?? []).join(" ");
    text = normalizeText(`${poi.name} ${poi.title} ${poi.subzone} ${zone.name} ${aliases} ${kindWords(poi)}`);
    haystacks.set(poi, text);
  }
  return text;
}

interface Scored extends NpcHit {
  name: number;
  side: number;
  yards: number;
}

function distance(poi: MapPoi, zone: WorldZone, player: PlayerLocation | null): number {
  if (!player) return Number.POSITIVE_INFINITY;
  return yardsBetween(player.world, zoneToWorld(zone, poi.x, poi.y));
}

export function searchNpcs(query: string, data: WorldMapData, context: SearchContext): NpcHit[] {
  const tokens = queryTokens(query);
  if (!tokens.length) return [];
  const scored: Scored[] = [];
  for (const poi of [...data.pois, ...data.questGivers, ...data.instances]) {
    const zone = data.zoneById.get(poi.zone);
    if (!zone || !matchesAll(tokens, haystackFor(poi, zone))) continue;
    const nameMatches = matchesAll(tokens, normalizeText(poi.name));
    scored.push({
      poi,
      zone,
      name: nameMatches ? nameScore(poi.name, query) : 5,
      side: usableBy(poi, context.faction, false) ? 0 : 1,
      yards: distance(poi, zone, context.player),
    });
  }
  scored.sort((a, b) => a.name - b.name || a.side - b.side || a.yards - b.yards || a.poi.name.localeCompare(b.poi.name));

  // One row per NPC: a trainer who also gives quests shows once, as the trainer.
  const seen = new Set<string>();
  const hits: NpcHit[] = [];
  for (const { poi, zone } of scored) {
    const key = poi.npcId === undefined ? poi.id : `npc-${poi.npcId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push({ poi, zone });
    if (hits.length === MAX_NPC_RESULTS) break;
  }
  return hits;
}

export function searchMap(
  query: string,
  data: WorldMapData,
  places: readonly Place[],
  context: SearchContext,
): MapSearchResults {
  return {
    npcs: searchNpcs(query, data, context),
    places: findPlaces(query, places, MAX_PLACE_RESULTS),
  };
}

/** The NPC a `?npc=` link names: a creature id (a service NPC wins over a quest giver), else a map id. */
export function findLinkedPoi(value: string, data: WorldMapData): MapPoi | undefined {
  const npcId = Number(value);
  if (Number.isInteger(npcId) && npcId > 0) {
    const match = [...data.pois, ...data.questGivers].find((p) => p.npcId === npcId);
    if (match) return match;
  }
  return data.poiById.get(value);
}
