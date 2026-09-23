import { describe, expect, it } from "vitest";
import zonesJson from "@/games/wow-forever/data/worldMap/zones.json";
import travelJson from "@/games/wow-forever/data/worldMap/travel.json";
import servicesJson from "@/games/wow-forever/data/worldMap/classic/classicServices.json";
import questsJson from "@/games/wow-forever/data/worldMap/classic/classicQuests.json";
import dungeonsJson from "@/games/wow-forever/data/worldMap/classic/classicDungeons.json";
import masksJson from "@/games/wow-forever/data/worldMap/mapMasks.json";
import { decodeWorldMap } from "@/games/wow-forever/worldMap/decodeWorldMap";
import { zoneToWorld } from "@/games/wow-forever/worldMap/geometry";
import { mapToWorld, projectRect, worldToMap } from "@/games/wow-forever/worldMap/mapGeometry";
import {
  childrenOf,
  HIT_KIND,
  MAP_EDGE,
  hitTestMap,
  mapPath,
  neighbourLabels,
} from "@/games/wow-forever/worldMap/mapHitTest";

const data = decodeWorldMap({
  zones: zonesJson,
  travel: travelJson,
  services: servicesJson,
  quests: questsJson,
  dungeons: dungeonsJson,
  masks: masksJson,
});

const AZEROTH = 947;
const EASTERN_KINGDOMS = 1415;
const KALIMDOR = 1414;
const ELWYNN = 1429;
const WESTFALL = 1436;
const DUSKWOOD = 1431;
const STORMWIND = 1453;
const ZEPHRAS_ISLE = 2521;
const DUROTAR = 1411;

function map(id: number) {
  const found = data.maps.get(id);
  if (!found) throw new Error(`no map ${id}`);
  return found;
}

/** Where a spot on a zone's map is drawn on another map. */
function onMap(viewedId: number, zoneId: number, x: number, y: number) {
  const zone = data.zoneById.get(zoneId);
  if (!zone) throw new Error(`no zone ${zoneId}`);
  const point = worldToMap(map(viewedId), zoneToWorld(zone, x, y));
  if (!point) throw new Error("not on this map");
  return point;
}

describe("the map tree", () => {
  it("links zones to continents to the world map, as the in-game zoom-out does", () => {
    expect(mapPath(data, ELWYNN).map((m) => m.name)).toEqual(["Azeroth", "Eastern Kingdoms", "Elwynn Forest"]);
    expect(map(STORMWIND).parent).toBe(EASTERN_KINGDOMS);
    expect(childrenOf(data, AZEROTH).map((m) => m.id)).toEqual(
      expect.arrayContaining([EASTERN_KINGDOMS, KALIMDOR, ZEPHRAS_ISLE]),
    );
    expect(map(AZEROTH).parent).toBeNull();
  });

  it("keeps the world map out of the zone list", () => {
    expect(data.zoneById.has(AZEROTH)).toBe(false);
    expect(data.zoneById.get(ELWYNN)).toMatchObject({ territory: "alliance", levels: [5, 10], highlight: true });
  });

  it("round-trips a point through the world map's continent regions", () => {
    const goldshire = zoneToWorld(map(ELWYNN).zone!, 42, 65);
    const onWorld = worldToMap(map(AZEROTH), goldshire)!;
    expect(onWorld.x).toBeGreaterThan(55);
    const back = mapToWorld(map(AZEROTH), onWorld.x, onWorld.y)!;
    expect(back.continent).toBe(0);
    expect(back.wx).toBeCloseTo(goldshire.wx, 3);
    expect(back.wy).toBeCloseTo(goldshire.wy, 3);
  });

  it("projects a zone's rectangle onto its continent", () => {
    const rect = projectRect(map(EASTERN_KINGDOMS), map(ELWYNN).zone!)!;
    expect(rect.left).toBeGreaterThan(0);
    expect(rect.left + rect.width).toBeLessThan(100);
    // Both pictures are 3:2, so in percent of each the rectangle is square.
    expect(rect.width / rect.height).toBeCloseTo(1, 1);
  });
});

describe("hit-testing a click", () => {
  it("Goldshire on the Elwynn map is Elwynn Forest", () => {
    const hit = hitTestMap(data, ELWYNN, 42, 65);
    expect(hit.kind).toBe(HIT_KIND.here);
    expect(hit.target?.id).toBe(ELWYNN);
  });

  it("just west of Elwynn's edge is Westfall, just south is Duskwood", () => {
    const west = hitTestMap(data, ELWYNN, -2, 75);
    expect(west.kind).toBe(HIT_KIND.goTo);
    expect(west.target?.id).toBe(WESTFALL);
    expect(hitTestMap(data, ELWYNN, 50, 102).target?.id).toBe(DUSKWOOD);
  });

  it("a continent-view click inside Elwynn opens Elwynn Forest", () => {
    const { x, y } = onMap(EASTERN_KINGDOMS, ELWYNN, 42, 65);
    const hit = hitTestMap(data, EASTERN_KINGDOMS, x, y);
    expect(hit.kind).toBe(HIT_KIND.goTo);
    expect(hit.target?.id).toBe(ELWYNN);
  });

  it("the world map opens the continent under the click", () => {
    const { x, y } = onMap(AZEROTH, ELWYNN, 42, 65);
    expect(hitTestMap(data, AZEROTH, x, y).target?.id).toBe(EASTERN_KINGDOMS);
    const durotar = onMap(AZEROTH, DUROTAR, 50, 50);
    expect(hitTestMap(data, AZEROTH, durotar.x, durotar.y).target?.id).toBe(KALIMDOR);
  });

  it("Kalimdor's zones open from its continent map", () => {
    const { x, y } = onMap(KALIMDOR, DUROTAR, 50, 50);
    expect(hitTestMap(data, KALIMDOR, x, y).target?.id).toBe(DUROTAR);
  });

  it("open sea is nothing", () => {
    expect(hitTestMap(data, EASTERN_KINGDOMS, 15, 50).kind).toBe(HIT_KIND.none);
    expect(hitTestMap(data, AZEROTH, 48, 50).kind).toBe(HIT_KIND.none);
  });
});

describe("neighbour labels", () => {
  it("names Westfall on Elwynn's west side and Duskwood on its south", () => {
    const labels = neighbourLabels(data, ELWYNN);
    expect(labels).toContainEqual(expect.objectContaining({ edge: MAP_EDGE.west, text: "Westfall ←" }));
    expect(labels.find((l) => l.target.id === DUSKWOOD)?.edge).toBe(MAP_EDGE.south);
    expect(labels.some((l) => l.target.id === ELWYNN)).toBe(false);
  });

  it("labels no edges on a continent", () => {
    expect(neighbourLabels(data, EASTERN_KINGDOMS)).toEqual([]);
  });
});
