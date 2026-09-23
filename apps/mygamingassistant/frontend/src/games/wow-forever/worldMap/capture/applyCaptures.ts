/**
 * Lay World Map captures (what the addon saw in Forever) over the Classic
 * rows.
 *
 * A capture replaces the NEAREST Classic row of the same layer that is the
 * same thing — same NPC id (NPCs), same instance id (entrances), or failing
 * those the same name in the same zone. Anything unmatched is added as a new
 * row. Nearest, because one NPC id can have several Classic spawns and one
 * instance several entrances (Scarlet Monastery's wings).
 */
import {
  FACTION,
  POI_KIND,
  POI_SOURCE,
  type MapPoi,
  type QuestInfo,
  type WorldMapData,
} from "@/games/wow-forever/types/worldMap";
import type { CapturedQuest, MapCapture } from "@/games/wow-forever/types/mapCapture";
import { yardsBetween, zoneToWorld } from "@/games/wow-forever/worldMap/geometry";

function sameThing(classic: MapPoi, capture: MapCapture): boolean {
  // NPC and object quest givers have separate id spaces.
  if (capture.kind === POI_KIND.questGiver && classic.subkind !== capture.subkind) return false;
  if (capture.kind === POI_KIND.instance && capture.tag !== "") return classic.tag === capture.tag;
  if (capture.npc_id && classic.npcId !== undefined) return classic.npcId === capture.npc_id;
  return classic.name === capture.name && classic.zone === capture.zone_id;
}

function distance(data: WorldMapData, poi: MapPoi, capture: MapCapture): number {
  const a = data.zoneById.get(poi.zone);
  const b = data.zoneById.get(capture.zone_id);
  if (!a || !b || a.continent !== b.continent) return Number.POSITIVE_INFINITY;
  return yardsBetween(zoneToWorld(a, poi.x, poi.y), zoneToWorld(b, capture.x, capture.y));
}

function nearestMatch(data: WorldMapData, layer: readonly MapPoi[], capture: MapCapture): MapPoi | null {
  let best: MapPoi | null = null;
  let bestYards = Number.POSITIVE_INFINITY;
  for (const poi of layer) {
    if (poi.source !== POI_SOURCE.classic || !sameThing(poi, capture)) continue;
    const yards = distance(data, poi, capture);
    if (best === null || yards < bestYards) {
      best = poi;
      bestYards = yards;
    }
  }
  return best;
}

/** A captured quest: the Classic record when it's a known quest, else what the addon saw. */
function capturedQuest(
  q: CapturedQuest,
  fallbackId: number,
  side: MapPoi["faction"],
  known: ReadonlyMap<string, QuestInfo>,
): QuestInfo {
  const classic = (q.id ? known.get(`id:${q.id}`) : undefined) ?? known.get(`title:${q.title}`);
  if (classic) return classic;
  return { id: q.id ?? fallbackId, title: q.title, minLevel: q.min_level, level: q.level, side, classes: [] };
}

/** Classic quests the giver had, plus any new ones the capture saw. */
function mergedQuests(capture: MapCapture, classic: MapPoi | null, questIndex: ReadonlyMap<string, QuestInfo>): QuestInfo[] {
  const quests = [...(classic?.quests ?? [])];
  const side = capture.faction;
  for (const [i, q] of (capture.quests ?? []).entries()) {
    // Quests seen without an id get negative ids, unique within this giver.
    const info = capturedQuest(q, -(i + 1), side, questIndex);
    if (!quests.some((known) => known.id === info.id || known.title === info.title)) quests.push(info);
  }
  return quests.sort((a, b) => a.level - b.level || a.title.localeCompare(b.title));
}

function questIndexOf(givers: readonly MapPoi[]): Map<string, QuestInfo> {
  const index = new Map<string, QuestInfo>();
  for (const giver of givers) {
    for (const q of giver.quests ?? []) {
      index.set(`id:${q.id}`, q);
      index.set(`title:${q.title}`, q);
    }
  }
  return index;
}

function toPoi(capture: MapCapture, classic: MapPoi | null, questIndex: ReadonlyMap<string, QuestInfo>): MapPoi {
  const poi: MapPoi = {
    // Keep the Classic id so a selection survives captures arriving.
    id: classic?.id ?? `captured-${capture.capture_key}`,
    kind: capture.kind,
    // A matched Classic row knows the NPC's real service flags; the capture
    // only had its title to go on.
    subkind: classic?.subkind ?? capture.subkind,
    tag: classic?.tag ?? capture.tag,
    name: capture.name,
    title: capture.title || classic?.title || "",
    zone: capture.zone_id,
    subzone: capture.subzone,
    x: capture.x,
    y: capture.y,
    // Instances are open to both factions whatever the capturing character was.
    faction: capture.kind === POI_KIND.instance ? FACTION.neutral : capture.faction,
    source: POI_SOURCE.captured,
    capturedAt: capture.captured_at,
    npcId: capture.npc_id ?? classic?.npcId,
    levelMin: classic?.levelMin,
    levelMax: classic?.levelMax,
    requiredLevel: classic?.requiredLevel,
  };
  if (capture.kind === POI_KIND.questGiver) poi.quests = mergedQuests(capture, classic, questIndex);
  return poi;
}

function applyToLayer(
  data: WorldMapData,
  layer: readonly MapPoi[],
  captures: readonly MapCapture[],
  questIndex: ReadonlyMap<string, QuestInfo>,
): MapPoi[] {
  const replaced = new Map<string, MapCapture>();
  const added = new Map<string, MapCapture>();
  // Newest first: when two captures claim the same Classic row, the newest wins.
  const newestFirst = [...captures].sort((a, b) => b.captured_at.localeCompare(a.captured_at));
  for (const capture of newestFirst) {
    const match = nearestMatch(data, layer, capture);
    if (match && !replaced.has(match.id)) replaced.set(match.id, capture);
    else if (!match) added.set(capture.capture_key, capture);
  }
  const kept = layer.map((poi) => {
    const capture = replaced.get(poi.id);
    return capture ? toPoi(capture, poi, questIndex) : poi;
  });
  return [...kept, ...[...added.values()].map((c) => toPoi(c, null, questIndex))];
}

/** World Map data with the captures applied. Returns `data` itself when there are none. */
export function applyCaptures(data: WorldMapData, captures: readonly MapCapture[]): WorldMapData {
  if (captures.length === 0) return data;
  const questIndex = questIndexOf(data.questGivers);
  const ofKind = (kind: MapCapture["kind"]) => captures.filter((c) => c.kind === kind);
  const pois = applyToLayer(data, data.pois, ofKind(POI_KIND.service), questIndex);
  const questGivers = applyToLayer(data, data.questGivers, ofKind(POI_KIND.questGiver), questIndex);
  const instances = applyToLayer(data, data.instances, ofKind(POI_KIND.instance), questIndex);
  return {
    ...data,
    pois,
    questGivers,
    instances,
    poiById: new Map([...pois, ...questGivers, ...instances].map((p) => [p.id, p])),
  };
}
