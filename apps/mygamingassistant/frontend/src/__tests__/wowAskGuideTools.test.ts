/** The "Ask" chat's guide tools (rares, professions, gold, macros), run against the site's real data. */
import { describe, expect, it } from "vitest";
import { ASK_CARD } from "@/games/wow-forever/data/ask/askCardKinds";
import { ASK_EXAMPLES } from "@/games/wow-forever/data/ask/askExamples";
import { ASK_TOOL } from "@/games/wow-forever/data/ask/askTools";
import { tipsForLevel } from "@/games/wow-forever/data/gold/goldTips";
import { FARM_SORT, farmsFor } from "@/games/wow-forever/gold/goldFarms";
import { loadGoldFarms } from "@/games/wow-forever/gold/loadGoldFarms";
import { runAskTool } from "@/games/wow-forever/lib/ask/runAskTool";
import { fitsLevel } from "@/games/wow-forever/lib/rares/filterRares";
import { loadRares } from "@/games/wow-forever/lib/rares/loadRares";
import type { AskCard } from "@/games/wow-forever/types/ask/askCard";
import type { AskGoldCard } from "@/games/wow-forever/types/ask/askGoldCard";
import type { AskMacrosCard } from "@/games/wow-forever/types/ask/askMacrosCard";
import type { AskProfessionCard } from "@/games/wow-forever/types/ask/askProfessionCard";
import type { AskRaresCard } from "@/games/wow-forever/types/ask/askRaresCard";
import type { AskToolName } from "@/games/wow-forever/types/ask/askToolName";
import type { ChatToolUseBlock } from "@/games/wow-forever/types/ask/chatToolUseBlock";
import { ASK_WORLD, askToolData } from "./wowAskWorld";

const ASHENVALE = [...ASK_WORLD.zoneById.values()].find((z) => z.name === "Ashenvale")!;
const TOOL_RESULT_MAX_BYTES = 4096;

function call(name: AskToolName, input: Record<string, unknown>): ChatToolUseBlock {
  return { type: "tool_use", id: "toolu_guides_1", name, input };
}

function cardOf<K extends AskCard["kind"]>(card: AskCard | null, kind: K): Extract<AskCard, { kind: K }> {
  if (card?.kind !== kind) throw new Error(`expected a ${kind} card, got ${card?.kind ?? "none"}`);
  return card as Extract<AskCard, { kind: K }>;
}

async function run(name: AskToolName, input: Record<string, unknown>, player = {}) {
  const out = await runAskTool(call(name, input), askToolData(player));
  expect(out.isError).toBe(false);
  expect(new TextEncoder().encode(out.content).length).toBeLessThanOrEqual(TOOL_RESULT_MAX_BYTES);
  return { result: JSON.parse(out.content), card: out.card };
}

describe("find_rares", () => {
  it("level 30 in Ashenvale: real rares that fit, the zone's own first, with a route and the Rares list", async () => {
    const { result, card } = await run(ASK_TOOL.findRares, { level: 30, zone: "Ashenvale" });
    const rares: AskRaresCard = cardOf(card, ASK_CARD.rares);
    const { rares: all } = await loadRares();
    const byName = new Map(all.map((r) => [r.name, r]));

    expect(result.level).toBe(30);
    expect(result.near.place).toBe("Ashenvale");
    expect(result.in_zone).toBeGreaterThan(0);
    expect(rares.rows.length).toBeGreaterThan(0);
    expect(rares.rows.length).toBeLessThanOrEqual(5);
    for (const row of result.results) expect(fitsLevel(byName.get(row.name)!, 30)).toBe(true);
    expect(rares.rows[0].zoneId).toBe(ASHENVALE.id);
    expect(rares.pageHref).toBe(`/wow-forever/rares?zone=${ASHENVALE.id}&min=27&max=32`);
  });

  it("uses the saved level and zone when the question gives neither", async () => {
    const { result, card } = await run(ASK_TOOL.findRares, {}, { level: 30, zoneId: ASHENVALE.id });
    expect(result.level_source).toBe("saved level");
    expect(result.near.source).toBe("saved location");
    expect(cardOf(card, ASK_CARD.rares).origin?.fromMessage).toBe(false);
  });

  it("says the level isn't set instead of guessing one, and shows no card", async () => {
    const { result, card } = await run(ASK_TOOL.findRares, { zone: "Ashenvale" });
    expect(result).toEqual({ level: "not set", note: "the player's level isn't set; ask for it" });
    expect(card).toBeNull();
  });

  it("names a place the map doesn't know rather than swapping in the saved zone", async () => {
    const { result } = await run(ASK_TOOL.findRares, { level: 30, zone: "Narnia" }, { zoneId: ASHENVALE.id });
    expect(result.unknown_place).toBe("Narnia");
    expect(result.near).toBeNull();
    expect(result.in_zone).toBe(0);
  });
});

describe("profession_guide", () => {
  it("Tailoring from 150: the guide's own rows from that skill, crafts and materials, and the guide link", async () => {
    const { result, card } = await run(ASK_TOOL.professionGuide, { profession: "tailoring", skill: 150 });
    const guide: AskProfessionCard = cardOf(card, ASK_CARD.profession);
    expect(result.profession).toBe("Tailoring");
    expect(result.from_skill).toBe(150);
    expect(guide.rows.length).toBeGreaterThan(0);
    expect(guide.rows[0].skill).toMatch(/^150–\d+$/);
    expect(guide.rows[0].lines.some((l) => l.startsWith("Materials: "))).toBe(true);
    expect(guide.priced).toBe(true);
    expect(result.page_works_out_cheapest_route).toBe(true);
    expect(guide.pageHref).toBe("/wow-forever/professions?p=tailoring&skill=150");
  });

  it("Cooking from the start: the hand-written route's first row, no skill in the link", async () => {
    const { result, card } = await run(ASK_TOOL.professionGuide, { profession: "cooking" });
    const guide = cardOf(card, ASK_CARD.profession);
    expect(result.from_skill).toBe("start");
    expect(guide.rows[0].skill).toBe("1–10");
    expect(guide.more).toBeGreaterThan(0);
    expect(guide.pageHref).toBe("/wow-forever/professions?p=cooking");
  });

  it("says when the skill is past the end of the route", async () => {
    const { result, card } = await run(ASK_TOOL.professionGuide, { profession: "mining", skill: 300 });
    expect(result.note).toBe("the skill is past the end of the site's route");
    expect(cardOf(card, ASK_CARD.profession).rows).toHaveLength(0);
  });
});

describe("gold_farming", () => {
  it("level 40: the Making gold page's own top tips and farm spots, at vendor prices", async () => {
    const { result, card } = await run(ASK_TOOL.goldFarming, { level: 40 });
    const gold: AskGoldCard = cardOf(card, ASK_CARD.gold);
    const expected = farmsFor(await loadGoldFarms(), 40, { skinning: false, sort: FARM_SORT.gold });
    expect(result.gold_an_hour_is).toBe("vendor prices, not auction prices");
    expect(result.tips).toEqual(tipsForLevel(40).top.map((t) => t.title));
    expect(result.spots.map((s: { mob: string }) => s.mob)).toEqual(expected.map((f) => f.name));
    expect(gold.rows.map((r) => r.id)).toEqual(expected.map((f) => String(f.npcId)));
    expect(gold.pageHref).toBe("/wow-forever/gold#farm");
  });

  it("sorts by cloth when asked", async () => {
    const { result } = await run(ASK_TOOL.goldFarming, { level: 40, sort: "cloth" });
    expect(result.spots.length).toBeGreaterThan(0);
    for (const spot of result.spots) expect(spot.cloth_an_hour).not.toBeNull();
  });

  it("asks for the level when none is said or saved", async () => {
    const { result, card } = await run(ASK_TOOL.goldFarming, {});
    expect(result.level).toBe("not set");
    expect(card).toBeNull();
  });
});

describe("find_macros", () => {
  it("best warlock macros: the site's warlock macros with their text, never written by Claude", async () => {
    const { result, card } = await run(ASK_TOOL.findMacros, { class: "warlock", query: "best warlock macros" });
    const macros: AskMacrosCard = cardOf(card, ASK_CARD.macros);
    expect(result.results.length).toBe(5);
    for (const row of result.results) expect(row.class).toBe("Warlock");
    expect(result).not.toHaveProperty("note");
    expect(macros.macros.every((m) => m.text.length > 0)).toBe(true);
    expect(JSON.stringify(result)).not.toContain(macros.macros[0].text);
    expect(macros.pageHref).toBe("/wow-forever/macros?class=warlock");
  });

  it("puts the macros that match what they should do first", async () => {
    const { result } = await run(ASK_TOOL.findMacros, { class: "warlock", query: "pet" });
    for (const row of result.results.slice(0, 3)) expect(`${row.title} ${row.kind}`).toMatch(/pet/i);
  });

  it("falls back to the class's macros when the search matches none, and says so", async () => {
    const { result, card } = await run(ASK_TOOL.findMacros, { class: "mage", query: "zzzqqq" });
    expect(result.note).toMatch(/nothing matched/);
    expect(cardOf(card, ASK_CARD.macros).macros.length).toBeGreaterThan(0);
  });

  it("shows a no-results card when nothing matches and no class was given", async () => {
    const { card } = await run(ASK_TOOL.findMacros, { query: "zzzqqq" });
    expect(card?.kind).toBe(ASK_CARD.noResults);
  });
});

describe("the guide tools' inputs are checked against the schema", () => {
  it.each([
    ["a level over 60", ASK_TOOL.findRares, { level: 61 }],
    ["a zone that is too long", ASK_TOOL.findRares, { zone: "z".repeat(41) }],
    ["an unknown profession", ASK_TOOL.professionGuide, { profession: "archaeology" }],
    ["a missing profession", ASK_TOOL.professionGuide, { skill: 10 }],
    ["a skill over 300", ASK_TOOL.professionGuide, { profession: "mining", skill: 301 }],
    ["skinning that isn't true or false", ASK_TOOL.goldFarming, { level: 20, skinning: "yes" }],
    ["an unknown sort", ASK_TOOL.goldFarming, { level: 20, sort: "xp" }],
    ["an unknown class", ASK_TOOL.findMacros, { class: "deathknight" }],
    ["an unknown key", ASK_TOOL.findMacros, { class: "mage", hack: 1 }],
  ])("rejects %s", async (_label, name, input) => {
    const out = await runAskTool(call(name, input), askToolData({ level: 20 }));
    expect(out.isError).toBe(true);
    expect(out.card).toBeNull();
    expect(JSON.parse(out.content).error).toMatch(/^invalid input/);
  });
});

describe("the empty chat's guide examples are answered from real data", () => {
  it("lists them", () => {
    expect(ASK_EXAMPLES).toContain("Any rares worth killing around level 30 in Ashenvale?");
    expect(ASK_EXAMPLES).toContain("How do I level Tailoring from 150?");
  });
});
