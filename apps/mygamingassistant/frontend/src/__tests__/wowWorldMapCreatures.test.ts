import { describe, expect, it } from "vitest";
import zonesJson from "@/games/wow-forever/data/worldMap/zones.json";
import travelJson from "@/games/wow-forever/data/worldMap/travel.json";
import servicesJson from "@/games/wow-forever/data/worldMap/classic/classicServices.json";
import questsJson from "@/games/wow-forever/data/worldMap/classic/classicQuests.json";
import dungeonsJson from "@/games/wow-forever/data/worldMap/classic/classicDungeons.json";
import creaturesJson from "@/games/wow-forever/data/worldMap/classic/classicCreatures.json";
import masksJson from "@/games/wow-forever/data/worldMap/mapMasks.json";
import { FACTION } from "@/games/wow-forever/types/worldMap";
import { decodeCreatures, decodeWorldMap, withCreatures } from "@/games/wow-forever/worldMap/decodeWorldMap";
import { buildPlaces } from "@/games/wow-forever/worldMap/places";
import { searchMap, searchNpcs } from "@/games/wow-forever/worldMap/search";

const base = decodeWorldMap({
  zones: zonesJson,
  travel: travelJson,
  services: servicesJson,
  quests: questsJson,
  dungeons: dungeonsJson,
  masks: masksJson,
});
const data = withCreatures(base, creaturesJson);
const STORMWIND = 1453;
const options = { faction: FACTION.alliance, player: null } as const;

describe("creature search", () => {
  it("finds Lady Katrana Prestor and pins her in Stormwind Keep", () => {
    const [first] = searchNpcs("lady prestor", data, options);
    expect(first.poi.name).toBe("Lady Katrana Prestor");
    expect(first.zone.id).toBe(STORMWIND);
    // The Keep: the same spot as Highlord Bolvar Fordragon, who stands on her throne room floor.
    expect(first.poi.x).toBeCloseTo(80.1, 0);
    expect(first.poi.y).toBeCloseTo(38.2, 0);
  });

  it("finds her by one word of her name", () => {
    expect(searchNpcs("prestor", data, options)[0].poi.name).toBe("Lady Katrana Prestor");
  });

  it("finds her with a typo through the did-you-mean fallback", () => {
    const result = searchMap("lady prestr", data, buildPlaces(data), options);
    expect(result.allNpcs.map((h) => h.poi.name)).toContain("Lady Katrana Prestor");
    expect(result.didYouMean).toBeDefined();
  });

  it("does not know her before the creature chunk has loaded", () => {
    expect(searchNpcs("lady prestor", base, options)).toEqual([]);
  });

  it("makes every spot findable by id", () => {
    const spots = data.creatures.filter((p) => p.name === "Lady Katrana Prestor");
    expect(spots.length).toBeGreaterThan(0);
    spots.forEach((p) => expect(data.poiById.get(p.id)).toBe(p));
  });
});

describe("decodeCreatures", () => {
  const file = {
    columns: ["npcId", "name", "title", "levelMin", "levelMax", "side", "spots"],
    subzones: ["", "Elwynn Forest"],
    rows: [[1, "Hare", "", 1, 2, "N", [1429, 1, 10, 20, 1429, 0, 50, 60]]],
  };

  it("makes one point per spot, keeping their own ids and sub-zones", () => {
    const [a, b] = decodeCreatures(file);
    expect([a.id, a.subzone, a.x, a.y]).toEqual(["creature-1-0", "Elwynn Forest", 10, 20]);
    expect([b.id, b.subzone, b.x, b.y]).toEqual(["creature-1-1", "", 50, 60]);
  });

  it("throws on a spot with missing numbers or an unlisted sub-zone", () => {
    const short = { ...file, rows: [[1, "Hare", "", 1, 2, "N", [1429, 1, 10]]] };
    expect(() => decodeCreatures(short)).toThrow(/missing/);
    const lost = { ...file, rows: [[1, "Hare", "", 1, 2, "N", [1429, 9, 10, 20]]] };
    expect(() => decodeCreatures(lost)).toThrow(/sub-zone/);
  });
});
