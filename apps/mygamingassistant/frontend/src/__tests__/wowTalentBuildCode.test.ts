import { describe, expect, it } from "vitest";
import { WOW_CLASSES } from "@/games/wow-forever/data/classes";
import { TALENT_BUILD_CODE_VERSION, TALENT_COLUMNS, TALENT_TIERS } from "@/games/wow-forever/data/talents/talentConfig";
import { loadTalentClass } from "@/games/wow-forever/lib/talents/loadTalentClass";
import { decodeTalentBuild, decodeTalentLevel, encodeTalentBuild } from "@/games/wow-forever/lib/talents/talentBuildCode";
import { talentArrows } from "@/games/wow-forever/lib/talents/talentArrows";
import { addPoint, emptyBuild, isLegalBuild } from "@/games/wow-forever/lib/talents/talentRules";
import type { TalentBuild } from "@/games/wow-forever/types/talents/talentBuild";
import type { TalentTree } from "@/games/wow-forever/types/talents/talentTree";
import { talentTreesFixture } from "@/test/talentTreesFixture";

const TREES = talentTreesFixture();

/** Clicks every talent top to bottom, tree by tree, until no point goes in — a full level-60 build. */
function fillBuild(trees: readonly TalentTree[]): TalentBuild {
  let build = emptyBuild(trees);
  for (let pass = 0; pass < 6; pass += 1) {
    trees.forEach((tree, t) => {
      tree.talents.forEach((_talent, i) => {
        build = addPoint(trees, build, t, i, 60);
      });
    });
  }
  return build;
}

describe("build code", () => {
  it("is empty for an empty build", () => {
    expect(encodeTalentBuild(emptyBuild(TREES))).toBe("");
  });

  it("writes one digit per talent and drops trailing zeros", () => {
    expect(encodeTalentBuild([[5, 0, 1, 0, 0], [0], [3]])).toBe("2-501--3");
  });

  it("needs no escaping in a query", () => {
    expect(new URLSearchParams({ b: "2-501--3" }).toString()).toBe("b=2-501--3");
  });

  it("round-trips", () => {
    const build: TalentBuild = [[5, 5, 3, 1, 2], [5], [0]];
    expect(decodeTalentBuild(encodeTalentBuild(build), TREES)).toEqual(build);
  });

  it("rejects a wrong version, tree count, character or length", () => {
    expect(decodeTalentBuild("3-5--", TREES)).toBeNull();
    expect(decodeTalentBuild("2-5-", TREES)).toBeNull();
    expect(decodeTalentBuild("2-5a--", TREES)).toBeNull();
    expect(decodeTalentBuild("2-500000--", TREES)).toBeNull();
    expect(decodeTalentBuild(`2-${"0".repeat(200)}--`, TREES)).toBeNull();
  });

  it("reads a version-1 link (the client's old Classic trees) as no build", () => {
    expect(TALENT_BUILD_CODE_VERSION).toBe("2");
    expect(decodeTalentBuild("1-5--", TREES)).toBeNull();
    expect(decodeTalentBuild("1-501--3", TREES)).toBeNull();
  });

  it("rejects a build no character could have", () => {
    expect(decodeTalentBuild("2-6--", TREES)).toBeNull();
    expect(decodeTalentBuild("2-401--", TREES)).toBeNull();
    expect(decodeTalentBuild("2-5521--", TREES)).toBeNull();
  });

  it("reads a level from 10 to 60 only", () => {
    expect(decodeTalentLevel("42")).toBe(42);
    expect(decodeTalentLevel(null)).toBeNull();
    expect(decodeTalentLevel("9")).toBeNull();
    expect(decodeTalentLevel("61")).toBeNull();
    expect(decodeTalentLevel("4.5")).toBeNull();
  });
});

describe("every class's real trees", () => {
  it.each(WOW_CLASSES.map((c) => c.id))("%s: three trees in the grid, a full build round-trips", async (classId) => {
    const data = await loadTalentClass(classId);
    expect(data.apiBuild).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
    expect(data.trees).toHaveLength(3);
    for (const tree of data.trees) {
      for (const talent of tree.talents) {
        expect(talent.tier).toBeLessThan(TALENT_TIERS);
        expect(talent.column).toBeLessThan(TALENT_COLUMNS);
        expect(talent.ranks.length).toBeGreaterThan(0);
        expect(talent.ranks.length).toBeLessThanOrEqual(9);
        expect(talent.ranks.every((text) => text.length > 0)).toBe(true);
      }
      expect(talentArrows(tree)).toHaveLength(tree.talents.reduce((n, t) => n + t.prereqs.length, 0));
    }
    const full = fillBuild(data.trees);
    expect(isLegalBuild(data.trees, full)).toBe(true);
    expect(full.flat().reduce((a, b) => a + b, 0)).toBe(51);
    expect(decodeTalentBuild(encodeTalentBuild(full), data.trees)).toEqual(full);
  });
});

describe("the live trees", () => {
  it("are Forever's: Warlock Affliction has its new talents in game order", async () => {
    const data = await loadTalentClass("warlock");
    expect(data.trees.map((t) => t.name)).toEqual(["Affliction", "Demonology", "Destruction"]);
    const affliction = new Map(data.trees[0].talents.map((t) => [t.name, t]));
    for (const name of ["Soul Harvest", "Improved Drains", "Pandemic", "Malevolence", "Wrack"]) {
      expect(affliction.get(name)?.newInForever).toBe(true);
    }
    expect(affliction.get("Suppression")?.newInForever).toBe(false);
    const pandemic = affliction.get("Pandemic");
    expect([pandemic?.tier, pandemic?.column]).toEqual([2, 3]);
  });
});
