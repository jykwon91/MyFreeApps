import { describe, expect, it } from "vitest";
import zonesJson from "@/games/wow-forever/data/worldMap/zones.json";
import travelJson from "@/games/wow-forever/data/worldMap/travel.json";
import servicesJson from "@/games/wow-forever/data/worldMap/classic/classicServices.json";
import questsJson from "@/games/wow-forever/data/worldMap/classic/classicQuests.json";
import dungeonsJson from "@/games/wow-forever/data/worldMap/classic/classicDungeons.json";
import { SERVICE_KIND } from "@/games/wow-forever/data/worldMap/serviceKinds";
import type { MapCapture } from "@/games/wow-forever/types/mapCapture";
import { POI_SOURCE } from "@/games/wow-forever/types/worldMap";
import { applyCaptures } from "@/games/wow-forever/worldMap/capture/applyCaptures";
import { classifyCapturedNpc, NPC_OFFER } from "@/games/wow-forever/worldMap/capture/classifyCapturedNpc";
import { LuaParseError, parseSavedVariables } from "@/games/wow-forever/worldMap/capture/luaTable";
import { CaptureFileError, readCaptureFile, SKIP_REASON } from "@/games/wow-forever/worldMap/capture/readCaptureFile";
import { decodeWorldMap } from "@/games/wow-forever/worldMap/decodeWorldMap";

const data = decodeWorldMap({
  zones: zonesJson,
  travel: travelJson,
  services: servicesJson,
  quests: questsJson,
  dungeons: dungeonsJson,
});
const knownZone = (id: number) => data.zoneById.has(id);

/** What WoW writes to WTF\Account\<account>\SavedVariables\MGACompanion.lua. */
const SAVED_VARIABLES = `
MGACompanionDB = {
	["version"] = 1,
	["captures"] = {
		["npc:906"] = {
			["kind"] = "npc",
			["id"] = 906,
			["name"] = "Maximillian Crowe",
			["title"] = "Warlock Trainer",
			["faction"] = "A",
			["map"] = 1429,
			["zone"] = "Elwynn Forest",
			["subzone"] = "Goldshire",
			["x"] = 43.9,
			["y"] = 65.8,
			["offers"] = {
				["trainer"] = true,
			},
			["at"] = 1789000000,
			["playerLevel"] = 12,
			["playerFaction"] = "A",
		},
		["npc:1234"] = {
			["kind"] = "npc",
			["id"] = 1234,
			["name"] = "Some Guard",
			["title"] = "Stormwind City Guard",
			["faction"] = "A",
			["map"] = 1429,
			["x"] = 40,
			["y"] = 60,
			["at"] = 1789000000,
		},
		["quest:npc:823"] = {
			["kind"] = "quest",
			["type"] = "npc",
			["id"] = 823,
			["name"] = "Deputy Willem",
			["faction"] = "A",
			["map"] = 1429,
			["subzone"] = "Northshire Abbey",
			["x"] = 48.1,
			["y"] = 41.9,
			["quests"] = {
				{
					["id"] = 783,
					["title"] = "A Threat Within",
					["level"] = 1,
				}, -- [1]
				{
					["title"] = "A \\"New\\" Forever Quest",
					["level"] = 3,
				}, -- [2]
			},
			["at"] = 1789000100,
			["playerLevel"] = 1,
		},
		["instance:189:1420:8530"] = {
			["kind"] = "instance",
			["type"] = "dungeon",
			["id"] = 189,
			["name"] = "Scarlet Monastery",
			["faction"] = "N",
			["map"] = 1420,
			["x"] = 85.2,
			["y"] = 30.4,
			["at"] = 1789000200,
		},
		["npc:77"] = {
			["kind"] = "npc",
			["id"] = 77,
			["name"] = "Nowhere Banker",
			["title"] = "Banker",
			["faction"] = "A",
			["map"] = 9999,
			["x"] = 50,
			["y"] = 50,
			["at"] = 1789000000,
		},
	},
}
`;

describe("SavedVariables reader", () => {
  it("reads nested tables, arrays, escapes and comments", () => {
    const vars = parseSavedVariables('A = { 1, 2, ["k"] = "x\\ty", n = -1.5e2, t = true, z = nil } -- done\nB = "\\65"');
    expect(vars).toEqual({ A: { "1": 1, "2": 2, k: "x\ty", n: -150, t: true }, B: "A" });
    expect(parseSavedVariables("L = { 'a', 'b', }")).toEqual({ L: ["a", "b"] });
  });

  it("refuses anything that isn't data", () => {
    expect(() => parseSavedVariables("os.execute('rm -rf /')")).toThrow(LuaParseError);
    expect(() => parseSavedVariables('A = { "unfinished }')).toThrow(LuaParseError);
  });
});

describe("classifyCapturedNpc", () => {
  const none = new Set<never>();
  it("reads services from titles and what the NPC offered", () => {
    expect(classifyCapturedNpc("Warlock Trainer", none)).toEqual({ subkind: SERVICE_KIND.classTrainer, tag: "warlock" });
    expect(classifyCapturedNpc("Demon Trainer", none)).toEqual({ subkind: SERVICE_KIND.demonTrainer, tag: "warlock" });
    expect(classifyCapturedNpc("Journeyman Tailor", none)).toEqual({ subkind: SERVICE_KIND.professionTrainer, tag: "tailoring" });
    expect(classifyCapturedNpc("Gryphon Master", none)?.subkind).toBe(SERVICE_KIND.flightMaster);
    expect(classifyCapturedNpc("", new Set([NPC_OFFER.taxi]))?.subkind).toBe(SERVICE_KIND.flightMaster);
    expect(classifyCapturedNpc("Armorer", new Set([NPC_OFFER.repair]))?.subkind).toBe(SERVICE_KIND.repair);
  });

  it("ignores vendors and guards", () => {
    expect(classifyCapturedNpc("Tailoring Supplies", none)).toBeNull();
    expect(classifyCapturedNpc("Stormwind City Guard", none)).toBeNull();
  });
});

describe("readCaptureFile", () => {
  it("turns the addon's records into captures and says what it skipped", () => {
    const result = readCaptureFile(SAVED_VARIABLES, knownZone);
    const byKey = new Map(result.captures.map((c) => [c.capture_key, c]));

    expect(byKey.get("npc:906:service")).toMatchObject({
      kind: "service",
      subkind: "class_trainer",
      tag: "warlock",
      npc_id: 906,
      zone_id: 1429,
      x: 43.9,
      captured_at: new Date(1789000000 * 1000).toISOString(),
    });
    expect(byKey.get("quest:npc:823")?.quests).toEqual([
      { id: 783, title: "A Threat Within", level: 1, min_level: 1 },
      { id: null, title: 'A "New" Forever Quest', level: 3, min_level: 1 },
    ]);
    expect(byKey.get("instance:189:1420:8530")).toMatchObject({ kind: "instance", subkind: "dungeon", tag: "189" });
    expect(result.skipped).toEqual({ [SKIP_REASON.notAService]: 1, [SKIP_REASON.unknownZone]: 1 });
  });

  it("explains files that aren't the addon's", () => {
    expect(() => readCaptureFile("Other = {}", knownZone)).toThrow(CaptureFileError);
    expect(() => readCaptureFile("MGACompanionDB = { version = 9 }", knownZone)).toThrow(/different version/);
    expect(() => readCaptureFile("not lua at all {", knownZone)).toThrow(CaptureFileError);
  });
});

describe("applyCaptures", () => {
  const { captures } = readCaptureFile(SAVED_VARIABLES, knownZone);
  const merged = applyCaptures(data, captures);

  it("moves the Classic trainer to where it was seen, keeping its id", () => {
    const crowes = merged.pois.filter((p) => p.npcId === 906);
    expect(crowes).toHaveLength(1);
    expect(crowes[0]).toMatchObject({ id: "classic-80353", x: 43.9, y: 65.8, source: POI_SOURCE.captured });
    expect(merged.poiById.get("classic-80353")?.source).toBe(POI_SOURCE.captured);
    expect(merged.pois).toHaveLength(data.pois.length);
  });

  it("keeps a quest giver's Classic quests and adds the new ones", () => {
    const willem = merged.questGivers.find((p) => p.npcId === 823 && p.source === POI_SOURCE.captured);
    const titles = willem?.quests?.map((q) => q.title) ?? [];
    expect(titles).toContain("A Threat Within");
    expect(titles).toContain('A "New" Forever Quest');
  });

  it("replaces only the nearest entrance of an instance and keeps its levels", () => {
    const sm = merged.instances.filter((p) => p.tag === "189");
    expect(sm).toHaveLength(4);
    const captured = sm.filter((p) => p.source === POI_SOURCE.captured);
    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({ title: "Cathedral", levelMin: 30, requiredLevel: 20 });
  });

  it("adds captures that match nothing as new rows", () => {
    const newGiver: MapCapture = {
      capture_key: "quest:npc:999999",
      kind: "quest_giver",
      subkind: "npc",
      tag: "",
      npc_id: 999999,
      name: "Forever Newcomer",
      title: "",
      zone_id: 2521,
      subzone: "",
      x: 50,
      y: 50,
      faction: "A",
      quests: [{ id: null, title: "Welcome", level: 1, min_level: 1 }],
      captured_at: "2026-09-20T00:00:00.000Z",
    };
    const withNew = applyCaptures(data, [newGiver]);
    expect(withNew.questGivers).toHaveLength(data.questGivers.length + 1);
    expect(withNew.poiById.get("captured-quest:npc:999999")?.quests?.[0]).toMatchObject({ id: -1, title: "Welcome" });
  });

  it("leaves the data alone without captures", () => {
    expect(applyCaptures(data, [])).toBe(data);
  });
});
