import { describe, expect, it } from "vitest";
import { ASK_CARD } from "@/games/wow-forever/data/ask/askCardKinds";
import { ASK_TOOL } from "@/games/wow-forever/data/ask/askTools";
import { routeSummary, tripLabel } from "@/games/wow-forever/lib/ask/askTrip";
import { originFromMessage, originLocation } from "@/games/wow-forever/lib/ask/resolveAskOrigin";
import { runAskTool } from "@/games/wow-forever/lib/ask/runAskTool";
import type { AskNpcRow } from "@/games/wow-forever/types/ask/askNpcRow";
import { FACTION, type PlayerFaction } from "@/games/wow-forever/types/worldMap";
import { STEP_KIND, type DirectionStep, type Directions } from "@/games/wow-forever/worldMap/directions";
import { NEAR_GROUP, rankPois } from "@/games/wow-forever/worldMap/nearest";
import { ASK_PLACES, ASK_WORLD, askToolData } from "./wowAskWorld";

async function desolaceRows(faction: PlayerFaction): Promise<{ rows: AskNpcRow[]; sent: { route?: string }[] }> {
  const out = await runAskTool(
    { type: "tool_use", id: "t1", name: ASK_TOOL.searchNpcs, input: { query: "warlock trainer", from_zone: "Desolace" } },
    askToolData({ faction }),
  );
  if (out.card?.kind !== ASK_CARD.npcs) throw new Error("expected an npcs card");
  return { rows: out.card.rows, sent: (JSON.parse(out.content) as { results: { route?: string }[] }).results };
}

function minutes(row: AskNpcRow): number {
  return Number(/about (\d+) min/.exec(row.distance)?.[1]);
}

function step(kind: DirectionStep["kind"], label: string, zoneName = "Somewhere"): DirectionStep {
  return { kind, text: label, place: { label, zoneId: 1, zoneName, subzone: "", x: 0, y: 0 } };
}

function trip(steps: DirectionStep[], seconds = 600, yards = 6100): Directions {
  return { steps, usesFlight: false, seconds, yards, straightWalks: false };
}

describe("Ask NPC answers: travel comes from the planned route", () => {
  it("a Horde player in Desolace is never told about a boat or zeppelin for Durotar (same continent)", async () => {
    const { rows, sent } = await desolaceRows(FACTION.horde);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row.route).not.toMatch(/boat|zeppelin/);
    for (const r of sent) expect(r.route).not.toMatch(/boat|zeppelin/);
  });

  it("an Alliance player in Desolace gets a boat, never a zeppelin, and only on rows whose route uses one", async () => {
    const { rows, sent } = await desolaceRows(FACTION.alliance);
    expect(rows.some((r) => /boat/.test(r.route ?? ""))).toBe(true);
    for (const row of rows) {
      expect(row.route).not.toMatch(/zeppelin/);
      expect(row.distance).not.toMatch(/boat|zeppelin/);
    }
    expect(sent.every((r) => r.route === undefined || r.route.length > 0)).toBe(true);
  });

  it("lists the cheapest trip first, and the shown times never go backwards", async () => {
    for (const faction of [FACTION.horde, FACTION.alliance]) {
      const { rows } = await desolaceRows(faction);
      const times = rows.map(minutes);
      expect(times).toEqual([...times].sort((a, b) => a - b));
    }
  });
});

describe("the World Map's nearest ranking: the order is the distances shown", () => {
  it("a capital is not ranked above a closer village", () => {
    const origin = originFromMessage("Desolace", ASK_PLACES);
    const location = originLocation(origin, ASK_WORLD);
    if (location === null) throw new Error("Desolace should resolve");
    const trainers = ASK_WORLD.pois.filter((p) => p.title === "Warlock Trainer" && p.faction === FACTION.horde);
    const onContinent = rankPois(trainers, location, ASK_WORLD).filter((r) => r.group !== NEAR_GROUP.otherContinent);
    expect(onContinent.length).toBeGreaterThan(1);
    const yards = onContinent.map((r) => r.yards ?? Infinity);
    expect(yards).toEqual([...yards].sort((a, b) => a - b));
  });
});

describe("route summaries", () => {
  it("names the ride and merges consecutive walks", () => {
    const d = trip([step(STEP_KIND.walk, "a"), step(STEP_KIND.walk, "b"), step(STEP_KIND.boat, "Dock", "Darkshore")]);
    expect(routeSummary(d)).toBe("walk → boat to Darkshore");
  });

  it("names a flight by its flight master's town", () => {
    const d = trip([step(STEP_KIND.fly, "the flight master at Auberdine, Darkshore")]);
    expect(routeSummary(d)).toBe("fly to Auberdine, Darkshore");
  });

  it("labels a trip with minutes and yards", () => {
    expect(tripLabel(trip([], 370, 6100))).toBe("about 6 min, ~6,100 yd");
  });
});
