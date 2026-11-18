import { describe, expect, it } from "vitest";
import { placedGiversByName, turnInGiver } from "@/games/wow-forever/lib/dungeonQuestsAddon/turnInGiver";
import type { QuestGiver } from "@/games/wow-forever/types/dungeons/questGiver";

const giver = (id: number, name: string, x = 50): QuestGiver => ({
  kind: "npc",
  id,
  name,
  place: { zoneId: 1436, zoneName: "Westfall", subzone: "", x, y: 47 },
  insideDungeon: false,
});

describe("turnInGiver", () => {
  it("finds the one NPC a quest goes back to", () => {
    const gryan = giver(234, "Gryan Stoutmantle");
    expect(turnInGiver(["Gryan Stoutmantle"], placedGiversByName([gryan]))).toBe(gryan);
  });

  it("the same NPC listed twice is still that NPC", () => {
    const givers = placedGiversByName([giver(234, "Gryan Stoutmantle", 56.3), giver(234, "Gryan Stoutmantle", 56.31)]);
    expect(turnInGiver(["Gryan Stoutmantle"], givers)?.id).toBe(234);
  });

  it("two different NPCs with one name can't say which, even if a third shows up", () => {
    const givers = placedGiversByName([giver(1, "Guard"), giver(2, "Guard"), giver(1, "Guard")]);
    expect(turnInGiver(["Guard"], givers)).toBeNull();
  });

  it("a quest with two enders has no one spot", () => {
    const givers = placedGiversByName([giver(1, "Alliance Ender"), giver(2, "Horde Ender")]);
    expect(turnInGiver(["Alliance Ender", "Horde Ender"], givers)).toBeNull();
  });

  it("an ender we have no spot for, or one only inside a dungeon, has none", () => {
    const inside = { ...giver(3, "Inside"), insideDungeon: true };
    const noPlace = { ...giver(4, "Nowhere"), place: null };
    const givers = placedGiversByName([inside, noPlace]);
    expect(turnInGiver(["Inside"], givers)).toBeNull();
    expect(turnInGiver(["Nowhere"], givers)).toBeNull();
    expect(turnInGiver(["Stranger"], givers)).toBeNull();
  });
});
