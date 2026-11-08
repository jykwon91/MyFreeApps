import { describe, expect, it } from "vitest";
import { CRAFTING_RANKS } from "@/games/wow-forever/data/professions/crafting/craftingTrainers";
import { COOKING_ROUTE } from "@/games/wow-forever/data/professions/cooking";
import { FISHING_ROUTE } from "@/games/wow-forever/data/professions/fishing";
import type { RankTrainer } from "@/games/wow-forever/data/professions/rankTrainerTypes";
import { listedRankTrainers, orderRankTrainers, rankTrainers } from "@/games/wow-forever/data/professions/rankTrainers";
import { milestoneNpc } from "@/games/wow-forever/lib/milestoneNpc";
import { FACTION } from "@/games/wow-forever/types/worldMap";

const names = (trainers: readonly RankTrainer[]): string[] => trainers.map((t) => t.name);

function trainer(npcId: number, zoneId: number): RankTrainer {
  return { npcId, name: `T${npcId}`, zoneId, where: "Somewhere", x: 1, y: 1, city: false };
}

describe("rankTrainers", () => {
  it("lists only your faction's trainers plus neutral ones", () => {
    const alliance = names(rankTrainers("tailoring", "Artisan", FACTION.alliance));
    const horde = names(rankTrainers("tailoring", "Artisan", FACTION.horde));
    expect(alliance).toContain("Timothy Worthington");
    expect(alliance).not.toContain("Daryl Stack");
    expect(horde).toContain("Daryl Stack");
    expect(horde).not.toContain("Timothy Worthington");
  });

  it("includes a neutral trainer for both factions", () => {
    expect(names(rankTrainers("blacksmithing", "Artisan", FACTION.alliance))).toEqual(["Brikk Keencraft"]);
    expect(names(rankTrainers("blacksmithing", "Artisan", FACTION.horde))).toEqual(["Brikk Keencraft"]);
  });

  it("puts capitals first", () => {
    const list = rankTrainers("tailoring", "Journeyman", FACTION.alliance);
    expect(list.length).toBeGreaterThan(3);
    expect(list[0].city).toBe(true);
    expect(list[list.length - 1].city).toBe(false);
  });

  it("gives both factions a Journeyman trainer for every profession", () => {
    for (const profession of ["tailoring", "enchanting", "alchemy", "blacksmithing", "leatherworking", "engineering", "cooking", "fishing", "firstaid"] as const) {
      const both = listedRankTrainers(profession, "Journeyman");
      expect(both.A.length, profession).toBeGreaterThan(0);
      expect(both.H.length, profession).toBeGreaterThan(0);
    }
  });

  it("returns every trainer exactly once", () => {
    const list = rankTrainers("cooking", "Journeyman", FACTION.horde);
    expect(new Set(list.map((t) => t.npcId)).size).toBe(list.length);
  });
});

describe("orderRankTrainers", () => {
  const trainers = [trainer(1, 10), trainer(2, 20), trainer(3, 30), trainer(4, 20)];

  it("lists trainers in your own zone first and keeps the rest in order", () => {
    expect(orderRankTrainers(trainers, 20).map((t) => t.npcId)).toEqual([2, 4, 1, 3]);
  });

  it("keeps the order when no zone is set or none matches", () => {
    expect(orderRankTrainers(trainers, null)).toBe(trainers);
    expect(orderRankTrainers(trainers, 99).map((t) => t.npcId)).toEqual([1, 2, 3, 4]);
  });
});

describe("rank data on the guides", () => {
  it("lists trainers for every trainer-taught crafting rank", () => {
    for (const ranks of Object.values(CRAFTING_RANKS)) {
      for (const rank of ranks) {
        if (rank.trainers.kind !== "list") continue;
        expect(rank.trainers.trainers.A.length).toBeGreaterThan(0);
        expect(rank.trainers.trainers.H.length).toBeGreaterThan(0);
      }
    }
  });

  it("resolves a milestone's NPC per faction, or none", () => {
    const quest = COOKING_ROUTE.find((s) => s.kind === "milestone" && s.name.startsWith("Artisan quest"));
    const plain = FISHING_ROUTE.find((s) => s.kind === "milestone" && s.teaches);
    if (quest?.kind !== "milestone" || plain?.kind !== "milestone") throw new Error("milestones missing");
    expect(milestoneNpc(quest, FACTION.alliance)?.name).toBe("Dirge Quikcleave");
    expect(milestoneNpc(quest, FACTION.horde)?.name).toBe("Dirge Quikcleave");
    expect(milestoneNpc(plain, FACTION.alliance)).toBeNull();
  });
});
