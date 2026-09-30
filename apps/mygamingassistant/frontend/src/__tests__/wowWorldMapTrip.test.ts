import { describe, expect, it } from "vitest";
import zonesJson from "@/games/wow-forever/data/worldMap/zones.json";
import travelJson from "@/games/wow-forever/data/worldMap/travel.json";
import servicesJson from "@/games/wow-forever/data/worldMap/classic/classicServices.json";
import questsJson from "@/games/wow-forever/data/worldMap/classic/classicQuests.json";
import dungeonsJson from "@/games/wow-forever/data/worldMap/classic/classicDungeons.json";
import masksJson from "@/games/wow-forever/data/worldMap/mapMasks.json";
import { FACTION } from "@/games/wow-forever/types/worldMap";
import { decodeWorldMap } from "@/games/wow-forever/worldMap/decodeWorldMap";
import { buildPlaces } from "@/games/wow-forever/worldMap/places";
import {
  commonMap,
  ENDPOINT_KIND,
  formatEndpoint,
  parseEndpoint,
  resolveEndpoint,
  type Endpoint,
} from "@/games/wow-forever/worldMap/trip";

const data = decodeWorldMap({
  zones: zonesJson,
  travel: travelJson,
  services: servicesJson,
  quests: questsJson,
  dungeons: dungeonsJson,
  masks: masksJson,
});
const places = buildPlaces(data);

const ELWYNN = 1429;
const STORMWIND = 1453;
const WESTFALL = 1436;
const DUROTAR = 1411;

describe("trip ends in the URL", () => {
  it("round-trips every kind", () => {
    const ends: Endpoint[] = [
      { kind: ENDPOINT_KIND.npc, poiId: "classic-79755" },
      { kind: ENDPOINT_KIND.place, placeId: "town-1429-goldshire" },
      { kind: ENDPOINT_KIND.point, zoneId: ELWYNN, x: 42.1, y: 65.9 },
    ];
    for (const end of ends) expect(parseEndpoint(formatEndpoint(end))).toEqual(end);
  });

  it("ignores anything it can't read", () => {
    for (const text of [null, "", "npc:", "zone:12", "pt:1429,142,3", "pt:abc,1,2", "nonsense"]) {
      expect(parseEndpoint(text)).toBeNull();
    }
  });
});

describe("where a trip to a place goes", () => {
  const to = (placeId: string) => resolveEndpoint({ kind: ENDPOINT_KIND.place, placeId }, data, places, FACTION.alliance);

  it("an NPC is exact, and a creature id works like a map id", () => {
    const ryback = resolveEndpoint({ kind: ENDPOINT_KIND.npc, poiId: "5482" }, data, places, FACTION.alliance);
    expect(ryback).toMatchObject({ title: "Stephen Ryback", pinpoint: true, note: null });
    expect(ryback?.route.place).toMatchObject({ zoneId: STORMWIND, x: 78.2, y: 53.1 });
  });

  it("a town goes to its middle", () => {
    const goldshire = to("town-1429-goldshire");
    expect(goldshire).toMatchObject({ title: "Goldshire, Elwynn Forest", pinpoint: true });
    expect(goldshire?.note).toBe("Routing to the middle of Goldshire.");
  });

  it("a zone goes to its flight master for your side", () => {
    const westfall = to(`zone-${WESTFALL}`);
    expect(westfall?.note).toMatch(/^Westfall has no single spot, so I'm routing to its flight master/);
    const master = data.flightNodes.find((n) => n.zone === WESTFALL && n.faction === FACTION.alliance);
    expect(westfall?.route.place).toMatchObject({ x: master?.x, y: master?.y });
  });

  it("a zone with no flight master for your side goes to its main town", () => {
    const elwynn = to(`zone-${ELWYNN}`);
    expect(elwynn?.note).toMatch(/^Elwynn Forest has no single spot, so I'm routing to .+, its main town\.$/);
    expect(elwynn?.pinpoint).toBe(false);
  });

  it("a city goes to the middle of its map", () => {
    const stormwind = to(`zone-${STORMWIND}`);
    expect(stormwind?.route.place).toMatchObject({ zoneId: STORMWIND, x: 50, y: 50 });
    expect(stormwind?.note).toBe("Routing to the middle of Stormwind City.");
  });

  it("an unknown end resolves to nothing", () => {
    expect(to("town-1-nowhere")).toBeNull();
    expect(resolveEndpoint({ kind: ENDPOINT_KIND.npc, poiId: "999999999" }, data, places, FACTION.alliance)).toBeNull();
  });
});

describe("the map a route is seen on", () => {
  it("is the zone for a trip inside it, the zone around a capital, the continent, then Azeroth", () => {
    expect(commonMap(data, ELWYNN, ELWYNN)).toBe(ELWYNN);
    const aroundStormwind = commonMap(data, ELWYNN, STORMWIND);
    expect([ELWYNN, data.maps.get(ELWYNN)?.parent]).toContain(aroundStormwind);
    expect(commonMap(data, ELWYNN, WESTFALL)).toBe(data.maps.get(ELWYNN)?.parent);
    expect(commonMap(data, ELWYNN, DUROTAR)).toBe(data.worldMapId);
  });

  it("is an end's own map when its picture already holds the whole route", () => {
    const goldshire = resolveEndpoint({ kind: ENDPOINT_KIND.place, placeId: "town-1429-goldshire" }, data, places, FACTION.alliance);
    const ryback = resolveEndpoint({ kind: ENDPOINT_KIND.npc, poiId: "5482" }, data, places, FACTION.alliance);
    const points = [goldshire!.route.world, ryback!.route.world];
    expect(commonMap(data, ELWYNN, STORMWIND, points)).toBe(ELWYNN);
    expect(commonMap(data, STORMWIND, ELWYNN, points)).toBe(ELWYNN);
  });
});
