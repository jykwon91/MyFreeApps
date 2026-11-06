import { describe, expect, it } from "vitest";
import skinningJson from "@/games/wow-forever/data/professions/crafting/classic/skinning.json";
import { GATHERING_GUIDES } from "@/games/wow-forever/data/professions/gathering/gatheringGuides";
import { decodeSkinning } from "@/games/wow-forever/gathering/decodeSkinning";
import { leatherForBand } from "@/games/wow-forever/gathering/leatherForBand";
import { rankSkinningZones } from "@/games/wow-forever/gathering/rankSkinningZones";
import { skinBand } from "@/games/wow-forever/gathering/skinBand";
import { skillToSkinRange, skinBandLine, skinBandNote, skinReach } from "@/games/wow-forever/gathering/skinBandText";
import { maxSkinnableLevel, skillToSkin } from "@/games/wow-forever/gathering/skinLevels";
import { GATHERING_KIND } from "@/games/wow-forever/types/gathering/gatheringKind";
import type { SkinnableMob } from "@/games/wow-forever/types/gathering/skinnableMob";
import type { SkinningFile } from "@/games/wow-forever/types/gathering/skinningFile";
import zonesJson from "@/games/wow-forever/data/worldMap/zones.json";
import { FACTION, type Territory } from "@/games/wow-forever/types/worldMap";
import { decodeZone } from "@/games/wow-forever/worldMap/decodeWorldMap";

const decoded = decodeSkinning(skinningJson as unknown as SkinningFile);
const zoneById = new Map((zonesJson.zones as readonly unknown[]).map(decodeZone).map((z) => [z.id, z]));

function mob(name: string, minLevel: number, maxLevel: number, spawns: number, zoneId: number, territory: Territory | null): SkinnableMob {
  return {
    name,
    minLevel,
    maxLevel,
    spawns,
    leather: "Light Leather",
    spot: { zoneId, zoneName: `Zone ${zoneId}`, subzone: "", x: 50, y: 50, territory },
  };
}

describe("maxSkinnableLevel (Classic rule)", () => {
  it.each([
    [0, 10],
    [1, 10],
    [50, 15],
    [99, 19],
    [100, 20],
    [101, 20],
    [150, 30],
    [300, 60],
  ])("skill %i skins up to level %i", (skill, level) => {
    expect(maxSkinnableLevel(skill)).toBe(level);
  });
});

describe("skillToSkin", () => {
  it.each([
    [1, 1],
    [10, 1],
    [11, 10],
    [20, 100],
    [21, 105],
    [60, 300],
  ])("a level %i mob needs skill %i", (level, skill) => {
    expect(skillToSkin(level)).toBe(skill);
  });

  it("is the inverse of maxSkinnableLevel at every level", () => {
    for (let level = 11; level <= 60; level++) {
      expect(maxSkinnableLevel(skillToSkin(level))).toBe(level);
      expect(maxSkinnableLevel(skillToSkin(level) - 1)).toBeLessThan(level);
    }
  });
});

describe("skinBand", () => {
  it("skill 115, level 18 → beasts level 15–20, held back by your level", () => {
    const band = skinBand(115, 18);
    expect(band).toEqual({ skill: 115, level: 18, min: 15, max: 20, skillMax: 23, levelCapped: true });
    expect(skinBandLine(band)).toBe("Skill 115, level 18 → skin beasts level 15–20");
    expect(skinBandNote(band)).toMatch(/up to level 23/);
  });

  it.each([
    [null, 1, 1, 3],
    [75, 15, 12, 17],
    [150, 30, 25, 30],
    [280, 55, 51, 56],
    [300, 60, 55, 60],
  ])("skill %s at level %i → %i–%i", (skill, level, min, max) => {
    expect(skinBand(skill, level)).toMatchObject({ min, max });
  });

  it("with no skill you've just trained it; with no level only the skill limits it", () => {
    const band = skinBand(null, null);
    expect(band).toMatchObject({ skill: 1, min: 5, max: 10, levelCapped: false });
    expect(skinBandLine(band)).toBe("Skill 1 → skin beasts level 5–10");
    expect(skinBandNote(band)).toMatch(/Set your level/);
  });

  it("says nothing extra when your skill sets the top", () => {
    expect(skinBandNote(skinBand(150, 30))).toBe("");
  });
});

describe("skinning text", () => {
  it("route tips follow the same rule", () => {
    expect(skinReach(75)).toBe("Skill 75 skins up to level 17.");
    expect(skinReach(300)).toBe("Skill 300 skins up to level 60.");
  });

  it("a leather bracket's skill range", () => {
    expect(skillToSkinRange(1, 10)).toBe("skill 1");
    expect(skillToSkinRange(11, 21)).toBe("skill 10–105");
  });
});

describe("leatherForBand", () => {
  const brackets = [
    { minLevel: 11, maxLevel: 21, leathers: ["Light Leather", "Ruined Leather Scraps", "Medium Leather"] },
    { minLevel: 22, maxLevel: 31, leathers: ["Medium Leather", "Light Leather", "Heavy Leather"] },
  ];

  it("names each bracket's main leather first", () => {
    expect(leatherForBand(brackets, { min: 18, max: 23 })).toEqual(["Light Leather", "Medium Leather", "Ruined Leather Scraps", "Heavy Leather"]);
    expect(leatherForBand(brackets, { min: 25, max: 30 })).toEqual(["Medium Leather", "Light Leather", "Heavy Leather"]);
  });
});

describe("rankSkinningZones", () => {
  const mobs = [
    mob("Wolf", 15, 16, 40, 1, "alliance"),
    mob("Boar", 16, 17, 10, 1, "alliance"),
    mob("Bear", 17, 18, 5, 1, "alliance"),
    mob("Cat", 15, 15, 3, 1, "alliance"),
    mob("Raptor", 16, 18, 60, 2, "contested"),
    mob("Strider", 15, 17, 80, 3, "horde"),
    mob("Too high", 19, 21, 99, 4, "contested"),
    mob("Too low", 12, 15, 99, 5, "contested"),
  ];

  it("keeps mobs whose whole range is in the band, off hostile ground, most spawns first", () => {
    const zones = rankSkinningZones({ mobs, band: { min: 15, max: 20, level: null }, faction: FACTION.alliance, zoneById: new Map() });
    expect(zones.map((z) => z.zoneId)).toEqual([2, 1]);
    expect(zones[1]).toMatchObject({ spawns: 58 });
    expect(zones[1].mobs.map((m) => m.name)).toEqual(["Wolf", "Boar", "Bear"]);
  });

  it("the other faction gets the other side's ground", () => {
    const zones = rankSkinningZones({ mobs, band: { min: 15, max: 20, level: null }, faction: FACTION.horde, zoneById: new Map() });
    expect(zones.map((z) => z.zoneId)).toEqual([3, 2]);
  });
});

describe("the committed Skinning data", () => {
  it("decodes every mob onto the map", () => {
    expect(decoded.mobs.length).toBe(skinningJson.mobs.length);
    expect(decoded.mobs.every((m) => m.spot.zoneName !== "")).toBe(true);
    expect(decoded.leather[0]).toMatchObject({ minLevel: 1, leathers: ["Ruined Leather Scraps", "Light Leather"] });
  });

  it("is the Skinning guide's mob file", async () => {
    const guide = GATHERING_GUIDES.skinning;
    if (guide.kind !== GATHERING_KIND.mobs) throw new Error("Skinning should be a mob guide");
    expect((await guide.load()).mobs.length).toBe(skinningJson.mobs.length);
  });

  it.each([
    [FACTION.alliance, 1, null, ["Elwynn Forest", "Dun Morogh", "Teldrassil"]],
    [FACTION.horde, 1, null, ["Durotar", "Mulgore", "Tirisfal Glades"]],
  ])("a new %s player is sent to starting zones", (faction, level, skill, starting) => {
    const zones = rankSkinningZones({ mobs: decoded.mobs, band: skinBand(skill, level), faction, zoneById });
    expect(zones.length).toBeGreaterThan(0);
    for (const z of zones) expect(starting.concat("Zephras Isle")).toContain(z.zoneName);
  });

  it.each([FACTION.alliance, FACTION.horde])("has two or three zones for %s at every checked skill and level", (faction) => {
    for (const [skill, level] of [[75, 15], [115, 18], [150, 30], [280, 55]] as const) {
      const zones = rankSkinningZones({ mobs: decoded.mobs, band: skinBand(skill, level), faction, zoneById });
      expect(zones.length).toBeGreaterThanOrEqual(2);
    }
  });
});
