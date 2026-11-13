import { describe, expect, it } from "vitest";
import { ASK_CARD } from "@/games/wow-forever/data/ask/askCardKinds";
import { ASK_TOOL } from "@/games/wow-forever/data/ask/askTools";
import { runAskTool } from "@/games/wow-forever/lib/ask/runAskTool";
import type { AskCard } from "@/games/wow-forever/types/ask/askCard";
import type { AskNpcCard } from "@/games/wow-forever/types/ask/askNpcCard";
import type { AskToolName } from "@/games/wow-forever/types/ask/askToolName";
import type { ChatToolUseBlock } from "@/games/wow-forever/types/ask/chatToolUseBlock";
import { FACTION } from "@/games/wow-forever/types/worldMap";
import { ASK_WORLD, askToolData } from "./wowAskWorld";

const DESOLACE = 1443;
const ELWYNN = 1429;

function call(name: AskToolName | string, input: Record<string, unknown>): ChatToolUseBlock {
  return { type: "tool_use", id: "toolu_fixture_1", name: name as AskToolName, input };
}

function npcCard(card: AskCard | null): AskNpcCard {
  if (card?.kind !== ASK_CARD.npcs) throw new Error(`expected an npcs card, got ${card?.kind ?? "none"}`);
  return card;
}

/** Every warlock trainer of a faction in the real map data — what "nearest" must pick from. */
function warlockTrainers(faction: string): Set<string> {
  return new Set(
    ASK_WORLD.pois
      .filter((p) => p.title === "Warlock Trainer" && p.faction === faction)
      .map((p) => p.id),
  );
}

describe("search_npcs — the Desolace warlock trainer question", () => {
  it("finds real Alliance warlock trainers, measured from Desolace, never the saved spot", async () => {
    const out = await runAskTool(
      call(ASK_TOOL.searchNpcs, { query: "warlock trainer", from_zone: "Desolace" }),
      askToolData({ faction: FACTION.alliance, zoneId: ELWYNN, position: { x: 40, y: 60 } }),
    );
    expect(out.isError).toBe(false);
    const card = npcCard(out.card);
    expect(card.origin).toMatchObject({ zoneId: DESOLACE, label: "Desolace", fromMessage: true });
    expect(card.rows.length).toBe(5);
    const real = warlockTrainers(FACTION.alliance);
    expect(real.size).toBeGreaterThan(0);
    for (const row of card.rows) {
      expect(real.has(row.poiId)).toBe(true);
      expect(row.title).toBe("Warlock Trainer");
    }
    expect(card.rows.map((r) => r.n)).toEqual([1, 2, 3, 4, 5]);
    expect(card.total).toBeGreaterThanOrEqual(card.rows.length);
    const sent = JSON.parse(out.content) as { from: { place: string; source: string }; results: { name: string }[] };
    expect(sent.from).toEqual({ place: "Desolace", source: "player's message" });
    expect(sent.results.map((r) => r.name)).toEqual(card.rows.map((r) => r.name));
  });

  it("gives a Horde player Horde trainers on Kalimdor with real distances", async () => {
    const out = await runAskTool(
      call(ASK_TOOL.searchNpcs, { query: "warlock trainer", from_zone: "Desolace" }),
      askToolData({ faction: FACTION.horde }),
    );
    const card = npcCard(out.card);
    const real = warlockTrainers(FACTION.horde);
    expect(card.rows.every((row) => real.has(row.poiId))).toBe(true);
    expect(card.rows.some((row) => row.zoneName === "Orgrimmar")).toBe(true);
    expect(card.rows.every((row) => /^about \d+ min, ~[\d,]+ yd$/.test(row.distance))).toBe(true);
  });

  it("uses the saved location when the question names no place", async () => {
    const out = await runAskTool(
      call(ASK_TOOL.searchNpcs, { query: "flight master" }),
      askToolData({ zoneId: ELWYNN, position: { x: 42, y: 65 } }),
    );
    expect(npcCard(out.card).origin).toMatchObject({ zoneId: ELWYNN, fromMessage: false });
  });

  it("says when the named place isn't on the map instead of using the saved spot", async () => {
    const out = await runAskTool(
      call(ASK_TOOL.searchNpcs, { query: "flight master", from_zone: "Qwxzzy" }),
      askToolData({ zoneId: ELWYNN }),
    );
    expect(JSON.parse(out.content)).toMatchObject({ unknown_place: "Qwxzzy", from: null });
    expect(npcCard(out.card).origin).toBeNull();
  });

  it("caps rows at the requested limit", async () => {
    const out = await runAskTool(call(ASK_TOOL.searchNpcs, { query: "flight master", limit: 2 }), askToolData());
    expect(npcCard(out.card).rows).toHaveLength(2);
  });

  it("makes a no-results card for nonsense", async () => {
    const out = await runAskTool(call(ASK_TOOL.searchNpcs, { query: "zzqqxx" }), askToolData());
    expect(out.card).toEqual({ kind: ASK_CARD.noResults, tool: ASK_TOOL.searchNpcs, query: "zzqqxx" });
  });
});

describe("the empty chat's example questions are answered from real data", () => {
  it("nearest flight master to Goldshire is Stormwind's", async () => {
    const out = await runAskTool(
      call(ASK_TOOL.searchNpcs, { query: "flight master", from_zone: "Goldshire" }),
      askToolData(),
    );
    const card = npcCard(out.card);
    expect(card.origin?.label).toBe("Goldshire, Elwynn Forest");
    expect(card.rows[0].zoneName).toBe("Stormwind City");
  });

  it("the Deadmines: levels and bosses", async () => {
    const out = await runAskTool(call(ASK_TOOL.dungeonInfo, { query: "Deadmines" }), askToolData());
    expect(out.card).toMatchObject({ kind: ASK_CARD.dungeon, slug: "deadmines", zones: ["Westfall"] });
    if (out.card?.kind !== ASK_CARD.dungeon) throw new Error("no dungeon card");
    expect(out.card.bosses).toContain("Edwin VanCleef");
  });

  it("a dungeon Forever added says what isn't known, never a missing rule", async () => {
    const out = await runAskTool(call(ASK_TOOL.dungeonInfo, { query: "City of Dalaran" }), askToolData());
    expect(out.card).toMatchObject({ kind: ASK_CARD.dungeon, slug: "city-of-dalaran", requiredLevel: null, zones: ["Alterac Mountains"] });
    const result = JSON.parse(out.content);
    expect(result.lowest_level_to_enter).toBe("not known yet");
    expect(result.new_in_forever).toBe(true);
    expect(result.not_known_yet).toContain("entrance_door");
  });

  it("a Classic dungeon carries no not-known list", async () => {
    const out = await runAskTool(call(ASK_TOOL.dungeonInfo, { query: "Deadmines" }), askToolData());
    const result = JSON.parse(out.content);
    expect(result.lowest_level_to_enter).toBe(10);
    expect(result).not.toHaveProperty("not_known_yet");
  });

  it("finds a dungeon by one of its bosses", async () => {
    const out = await runAskTool(call(ASK_TOOL.dungeonInfo, { query: "VanCleef" }), askToolData());
    expect(out.card).toMatchObject({ kind: ASK_CARD.dungeon, slug: "deadmines" });
  });

  it("Booty Bay is a town in Stranglethorn Vale", async () => {
    const out = await runAskTool(call(ASK_TOOL.findPlaces, { query: "Booty Bay" }), askToolData());
    if (out.card?.kind !== ASK_CARD.places) throw new Error("no places card");
    expect(out.card.rows[0]).toMatchObject({ name: "Booty Bay", kind: "town", label: "Booty Bay, Stranglethorn Vale" });
  });
});

describe("search_items and get_player_context", () => {
  it("searches the item list", async () => {
    const out = await runAskTool(call(ASK_TOOL.searchItems, { query: "crusader", limit: 2 }), askToolData());
    if (out.card?.kind !== ASK_CARD.items) throw new Error("no items card");
    expect(out.card.items).toHaveLength(2);
    expect(out.card.total).toBe(4);
  });

  it("an item list that won't load is an error result, not a thrown error", async () => {
    const data = { ...askToolData(), loadItems: () => Promise.reject(new Error("offline")) };
    const out = await runAskTool(call(ASK_TOOL.searchItems, { query: "crusader" }), data);
    expect(out).toMatchObject({ isError: true, card: null });
  });

  it("asks where you are when no zone is saved", async () => {
    const out = await runAskTool(call(ASK_TOOL.playerContext, {}), askToolData());
    expect(out.card).toEqual({ kind: ASK_CARD.where });
    expect(JSON.parse(out.content)).toMatchObject({ faction: "Alliance", zone: "not set" });
  });

  it("reports the saved zone and makes no card when it's set", async () => {
    const out = await runAskTool(call(ASK_TOOL.playerContext, {}), askToolData({ zoneId: DESOLACE, level: 34 }));
    expect(out.card).toBeNull();
    expect(JSON.parse(out.content)).toMatchObject({ zone: "Desolace", level: 34 });
  });
});

describe("tool inputs are checked against the schema", () => {
  it.each([
    ["an unknown key", ASK_TOOL.searchNpcs, { query: "inn", hack: 1 }],
    ["a missing query", ASK_TOOL.searchNpcs, {}],
    ["a query that is too long", ASK_TOOL.findPlaces, { query: "x".repeat(81) }],
    ["a limit over 10", ASK_TOOL.searchItems, { query: "helm", limit: 11 }],
    ["a non-integer limit", ASK_TOOL.searchNpcs, { query: "inn", limit: 2.5 }],
    ["an unknown faction", ASK_TOOL.searchNpcs, { query: "inn", faction: "scourge" }],
    ["a from_zone that is too long", ASK_TOOL.searchNpcs, { query: "inn", from_zone: "y".repeat(41) }],
    ["input on a no-input tool", ASK_TOOL.playerContext, { query: "me" }],
  ])("rejects %s", async (_label, name, input) => {
    const out = await runAskTool(call(name, input), askToolData());
    expect(out.isError).toBe(true);
    expect(out.card).toBeNull();
    expect(JSON.parse(out.content).error).toMatch(/^invalid input/);
  });

  it("rejects a tool it doesn't have", async () => {
    const out = await runAskTool(call("delete_everything", {}), askToolData());
    expect(out).toMatchObject({ isError: true, card: null });
  });

  it("keeps every result under the relay's 4 KB cap", async () => {
    const out = await runAskTool(call(ASK_TOOL.searchNpcs, { query: "trainer", limit: 10 }), askToolData());
    expect(new TextEncoder().encode(out.content).length).toBeLessThanOrEqual(4096);
  });
});
