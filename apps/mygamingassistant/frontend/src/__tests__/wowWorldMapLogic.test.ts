import { describe, expect, it } from "vitest";
import zonesJson from "@/games/wow-forever/data/worldMap/zones.json";
import travelJson from "@/games/wow-forever/data/worldMap/travel.json";
import servicesJson from "@/games/wow-forever/data/worldMap/classic/classicServices.json";
import { parsePlayerSettings } from "@/games/wow-forever/hooks/usePlayerSettings";
import { FACTION } from "@/games/wow-forever/types/worldMap";
import { decodeWorldMap } from "@/games/wow-forever/worldMap/decodeWorldMap";
import { STEP_KIND } from "@/games/wow-forever/worldMap/directions";
import { compassDirection, formatYards, worldToZone, zoneToWorld } from "@/games/wow-forever/worldMap/geometry";
import { NEAR_GROUP, sameAreaZoneIds } from "@/games/wow-forever/worldMap/nearest";
import { parseCoords } from "@/games/wow-forever/worldMap/parseCoords";
import { nextWarlockTraining } from "@/games/wow-forever/worldMap/training";
import { mgaWayCommand, wayCommand } from "@/games/wow-forever/worldMap/waypoints";
import { buildWorldMapModel, type WorldMapChoices } from "@/games/wow-forever/worldMap/worldMapModel";

const data = decodeWorldMap(zonesJson, travelJson, servicesJson);

const ELWYNN = 1429;
const STORMWIND = 1453;
const DUROTAR = 1411;
const ORGRIMMAR = 1454;
const ZEPHRAS_ISLE = 2521;

function choices(patch: Partial<WorldMapChoices>): WorldMapChoices {
  return {
    faction: FACTION.alliance,
    classId: "warlock",
    zoneId: ELWYNN,
    position: { x: 42, y: 65 }, // Goldshire
    findFilterId: "class_trainer",
    showAllClasses: false,
    includeOtherFaction: false,
    selectedPoiId: null,
    ...patch,
  };
}

function model(patch: Partial<WorldMapChoices>) {
  const m = buildWorldMapModel(data, choices(patch));
  if (!m) throw new Error("expected a model");
  return m;
}

describe("world map data", () => {
  it("decodes every layer and places every NPC on a known map", () => {
    expect(data.pois.length).toBeGreaterThan(900);
    expect(data.flightNodes.length).toBeGreaterThan(60);
    expect(data.transports.length).toBe(8);
    for (const poi of data.pois) {
      const zone = data.zoneById.get(poi.zone);
      expect(zone, poi.name).toBeDefined();
      // Classic NPCs never sit on a Forever-only zone's map.
      expect(zone?.foreverOnly, poi.name).toBeUndefined();
    }
  });

  it("rejects data with a missing column", () => {
    const broken = { ...servicesJson, columns: servicesJson.columns.filter((c) => c !== "zone") };
    expect(() => decodeWorldMap(zonesJson, travelJson, broken)).toThrow(/zone/);
  });
});

describe("geometry", () => {
  it("round-trips map percent through world yards", () => {
    const zone = data.zoneById.get(ELWYNN)!;
    const back = worldToZone(zone, zoneToWorld(zone, 43.8, 65.9));
    expect(back.x).toBeCloseTo(43.8, 6);
    expect(back.y).toBeCloseTo(65.9, 6);
  });

  it("reads compass directions on the map (up = north, right = east)", () => {
    const zone = data.zoneById.get(ELWYNN)!;
    const centre = zoneToWorld(zone, 50, 50);
    expect(compassDirection(centre, zoneToWorld(zone, 50, 20))).toBe("north");
    expect(compassDirection(centre, zoneToWorld(zone, 80, 50))).toBe("east");
    expect(compassDirection(centre, zoneToWorld(zone, 70, 70))).toBe("south-east");
  });

  it("rounds yards for reading", () => {
    expect(formatYards(348)).toBe("~350 yd");
    expect(formatYards(2412)).toBe("~2,400 yd");
    expect(formatYards(3)).toBe("~10 yd");
  });
});

describe("coordinates and commands", () => {
  it.each([
    ["45.2, 61.8", { x: 45.2, y: 61.8 }],
    ["45.2 61.8", { x: 45.2, y: 61.8 }],
    ["/way 45.2 61.8", { x: 45.2, y: 61.8 }],
    ["/way Elwynn Forest 45.2 61.8", { x: 45.2, y: 61.8, zoneName: "Elwynn Forest" }],
    ["/mga way 1429 44.4 66.2 Maximillian Crowe", { x: 44.4, y: 66.2, zoneId: 1429 }],
  ])("reads %s", (text, expected) => {
    expect(parseCoords(text)).toEqual(expected);
  });

  it.each(["", "hello", "120, 40", "45.2"])("rejects %s", (text) => {
    expect(parseCoords(text)).toBeNull();
  });

  it("builds the addon and /way commands", () => {
    const target = { zoneId: ELWYNN, zoneName: "Elwynn Forest", x: 44.4, y: 66.25, label: "Maximillian\nCrowe" };
    expect(mgaWayCommand(target)).toBe("/mga way 1429 44.4 66.3 Maximillian Crowe");
    expect(wayCommand(target)).toBe("/way Elwynn Forest 44.4 66.3");
  });
});

describe("nearest services", () => {
  it("finds the Goldshire Warlock trainer for an Alliance Warlock in Elwynn", () => {
    const m = model({});
    const trainer = m.hero[0];
    expect(trainer.filter.label).toBe("Warlock trainer");
    expect(trainer.best?.poi.name).toBe("Maximillian Crowe");
    expect(trainer.best?.group).toBe(NEAR_GROUP.sameArea);
    // Warlocks also get the demon trainer row, second.
    expect(m.hero[1].filter.id).toBe("demon_trainer");
  });

  it("finds the Razor Hill trainer for a Horde Warlock in Durotar and never shows Alliance NPCs", () => {
    const m = model({ faction: FACTION.horde, zoneId: DUROTAR, position: { x: 52, y: 42 } });
    expect(m.hero[0].best?.poi.name).toBe("Dhugru Gorelust");
    for (const r of m.findResults) expect(r.poi.faction).not.toBe(FACTION.alliance);
  });

  it("hides other classes' trainers unless asked", () => {
    expect(model({}).findResults.every((r) => r.poi.tag === "warlock")).toBe(true);
    const all = model({ showAllClasses: true }).findResults;
    expect(new Set(all.map((r) => r.poi.tag)).size).toBeGreaterThan(5);
  });

  it("counts Stormwind as the same area as Elwynn Forest", () => {
    expect(sameAreaZoneIds(data.zoneById.get(ELWYNN)!, data.zones).has(STORMWIND)).toBe(true);
  });

  it("puts other-continent results last with no distance", () => {
    // Every Alliance Warlock trainer is in the Eastern Kingdoms; flight masters span both continents.
    const results = model({ findFilterId: "flight_master" }).findResults;
    const last = results[results.length - 1];
    expect(last.group).toBe(NEAR_GROUP.otherContinent);
    expect(last.yards).toBeNull();
  });
});

describe("directions", () => {
  function directionsTo(name: string, patch: Partial<WorldMapChoices> = {}) {
    const poi = data.pois.find((p) => p.name === name);
    if (!poi) throw new Error(name);
    return model({ ...patch, selectedPoiId: poi.id }).directions;
  }

  it("walks to a trainer in the same zone", () => {
    const d = directionsTo("Maximillian Crowe");
    expect(d?.steps).toHaveLength(1);
    expect(d?.steps[0].kind).toBe(STEP_KIND.walk);
    expect(d?.steps[0].text).toMatch(/^Head (east|north-east|south-east), ~\d+ yd, to Maximillian Crowe — Goldshire, Elwynn Forest/);
  });

  it("flies across a continent", () => {
    const d = directionsTo("Gimrizz Shadowcog");
    expect(d?.usesFlight).toBe(true);
    expect(d?.steps.map((s) => s.kind)).toContain(STEP_KIND.fly);
    expect(d?.steps[d.steps.length - 1].place.label).toBe("Gimrizz Shadowcog");
  });

  it("takes a boat to another continent for the Alliance", () => {
    const d = directionsTo("Mirket", { includeOtherFaction: true });
    expect(d?.steps.some((s) => s.kind === STEP_KIND.boat)).toBe(true);
  });

  it("takes a zeppelin between Orgrimmar and Undercity for the Horde", () => {
    const d = directionsTo("Kaal Soulreaper", { faction: FACTION.horde, zoneId: ORGRIMMAR, position: { x: 50, y: 50 } });
    expect(d?.steps.some((s) => s.kind === STEP_KIND.zeppelin)).toBe(true);
  });

  it("says there is no known route off Zephras Isle", () => {
    expect(directionsTo("Maximillian Crowe", { zoneId: ZEPHRAS_ISLE, position: { x: 50, y: 50 } })).toBeNull();
  });
});

describe("player settings", () => {
  it("keeps valid stored settings and drops broken ones", () => {
    const stored = { faction: "H", classId: "warlock", zoneId: DUROTAR, level: 12, position: { x: 52, y: 42 } };
    expect(parsePlayerSettings(stored)).toEqual(stored);
    expect(parsePlayerSettings({ ...stored, faction: "X" })).toBeNull();
    expect(parsePlayerSettings({ ...stored, level: 99 })?.level).toBeNull();
    expect(parsePlayerSettings({ ...stored, position: { x: 500, y: 1 } })?.position).toBeNull();
  });

  it("hints Warlock training on even levels", () => {
    expect(nextWarlockTraining("warlock", 11)).toBe("Next Warlock training: level 12.");
    expect(nextWarlockTraining("warlock", 12)).toMatch(/Level 12 is a training level.*level 14/);
    expect(nextWarlockTraining("mage", 12)).toBeNull();
  });
});
