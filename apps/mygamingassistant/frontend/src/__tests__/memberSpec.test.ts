/**
 * resolveSpec(): picks the guild member's primary spec from their talent-tree points.
 *
 * Uses the real talentTrees.json (bundled data, no network), so tree ids and
 * names are production values.  The Warlock trees from the JSON are:
 *   355 Affliction, 354 Demonology, 593 Destruction
 */
import { describe, expect, it } from "vitest";
import { resolveSpec } from "@/games/wow-forever/lib/guild/memberSpec";
import type { GuildMemberTalentTree } from "@/games/wow-forever/types/guild/guildMemberTalentTree";

function tree(tree_id: number, points: number): GuildMemberTalentTree {
  return { tree_id, points };
}

// Warlock tree ids from talentTrees.json (class id "warlock")
const AFFLICTION = 355;
const DEMONOLOGY = 354;
const DESTRUCTION = 593;

describe("resolveSpec", () => {
  it("returns null when talents is null (fetch failed)", () => {
    expect(resolveSpec("warlock", null)).toBeNull();
  });

  it("returns null when talents is empty (no points spent)", () => {
    expect(resolveSpec("warlock", [])).toBeNull();
  });

  it("returns null when classId is null or undefined", () => {
    expect(resolveSpec(null, [tree(AFFLICTION, 23)])).toBeNull();
    expect(resolveSpec(undefined, [tree(AFFLICTION, 23)])).toBeNull();
  });

  it("returns null for an unknown class id not in the talent trees map", () => {
    expect(resolveSpec("unknownclass", [tree(AFFLICTION, 23)])).toBeNull();
  });

  it("returns null when no tree in the talents list matches the class tree ids", () => {
    // tree_id 999 does not exist for Warlock
    expect(resolveSpec("warlock", [tree(999, 23)])).toBeNull();
  });

  it("resolves the single spec when only one tree has points", () => {
    const spec = resolveSpec("warlock", [tree(AFFLICTION, 23)]);
    expect(spec).not.toBeNull();
    expect(spec!.name).toBe("Affliction");
    expect(spec!.points).toBe(23);
  });

  it("picks the spec with the most points when multiple trees have points", () => {
    const spec = resolveSpec("warlock", [tree(AFFLICTION, 23), tree(DEMONOLOGY, 8)]);
    expect(spec).not.toBeNull();
    expect(spec!.name).toBe("Affliction");
    expect(spec!.points).toBe(23);
  });

  it("resolves Demonology when it has more points than Affliction", () => {
    const spec = resolveSpec("warlock", [tree(AFFLICTION, 8), tree(DEMONOLOGY, 31)]);
    expect(spec).not.toBeNull();
    expect(spec!.name).toBe("Demonology");
    expect(spec!.points).toBe(31);
  });

  it("resolves Destruction", () => {
    const spec = resolveSpec("warlock", [tree(DESTRUCTION, 15)]);
    expect(spec).not.toBeNull();
    expect(spec!.name).toBe("Destruction");
  });

  it("on a tie takes the first entry in the talents array (Blizzard's return order)", () => {
    // Both have 20 points; Demonology appears first in the talents list.
    const spec = resolveSpec("warlock", [tree(DEMONOLOGY, 20), tree(AFFLICTION, 20)]);
    expect(spec).not.toBeNull();
    expect(spec!.name).toBe("Demonology");
  });

  it("resolves specs for a different class (Warrior)", () => {
    // Warrior tree ids from talentTrees.json: 26 Arms, 256 Fury, 257 Protection
    const spec = resolveSpec("warrior", [tree(26, 15)]);
    expect(spec).not.toBeNull();
    expect(spec!.name).toBe("Arms");
  });

  it("icon is null when the tree's file data id is 0, non-null otherwise", () => {
    // Affliction icon = 136145 (non-zero), so icon should not be null
    const spec = resolveSpec("warlock", [tree(AFFLICTION, 23)]);
    expect(spec).not.toBeNull();
    expect(spec!.icon).not.toBeNull();
  });
});

describe("talentTrees.json", () => {
  it("matches the trees (id, name, icon) of every class talent file", () => {
    const files = import.meta.glob<{ trees: { id: number; name: string; icon: number }[] }>(
      "../games/wow-forever/data/talents/*.json",
      { eager: true, import: "default" },
    );
    const index = files["../games/wow-forever/data/talents/talentTrees.json"] as unknown as Record<string, unknown>;
    const classIds = Object.keys(index);
    expect(classIds.length).toBeGreaterThan(0);
    for (const classId of classIds) {
      const file = files[`../games/wow-forever/data/talents/${classId}.json`];
      expect(index[classId]).toEqual(file.trees.map(({ id, name, icon }) => ({ id, name, icon })));
    }
  });
});
