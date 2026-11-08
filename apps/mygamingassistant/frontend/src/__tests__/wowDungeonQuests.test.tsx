import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import DungeonQuests from "@/games/wow-forever/components/dungeons/quests/DungeonQuests";
import { QUEST_GIVER_MAP_SCALE } from "@/games/wow-forever/data/dungeons/dungeonPageConfig";
import { WORLD_MAP_PAGE_PATH } from "@/games/wow-forever/data/worldMap/mapMarks";
import { PLAYER_SETTINGS_STORAGE_KEY } from "@/games/wow-forever/hooks/usePlayerSettings";
import { findDungeon } from "@/games/wow-forever/lib/dungeons/decodeDungeons";
import { decodeDungeonQuests } from "@/games/wow-forever/lib/dungeons/decodeDungeonQuests";
import {
  objectiveText,
  questClassesText,
  questLevelText,
  questsForFaction,
  rewardCountText,
} from "@/games/wow-forever/lib/dungeons/describeQuest";
import { loadDungeons } from "@/games/wow-forever/lib/dungeons/loadDungeons";
import { questGiverMapHref } from "@/games/wow-forever/lib/dungeons/questGiverMapHref";
import { questProvenance } from "@/games/wow-forever/lib/provenance/questProvenance";
import type { DungeonDataFiles } from "@/games/wow-forever/types/dungeons/dungeonDataFiles";
import type { DungeonQuest } from "@/games/wow-forever/types/dungeons/dungeonQuest";
import type { LootItemInfo } from "@/games/wow-forever/types/dungeons/lootItemInfo";
import type { WorldZone } from "@/games/wow-forever/types/worldMap";
import { decodeMapViewFragment } from "@/games/wow-forever/worldMap/mapViewShare";

const KEEP = 10;
const QUEST_COLUMNS = ["id", "title", "level", "minLevel", "side", "classes", "givers", "chain", "objectives", "rewards", "choices", "enders"];

function files(): Pick<DungeonDataFiles, "quests" | "seenQuests"> {
  return {
    quests: {
      questColumns: QUEST_COLUMNS,
      giverColumns: ["kind", "id", "name", "zone", "subzone", "x", "y", "instance"],
      objectiveColumns: ["kind", "id", "count"],
      targetColumns: ["name", "instance"],
      instances: { [KEEP]: [3, 5, 404] },
      quests: {
        "1": [1, "Lead In", 18, 15, "A", "", [["npc", 8, "Old Scout", 100, "", 10, 10, null]], [], [], [], [], []],
        "2": [2, "Second Step", 19, 15, "A", "", [], [1], [], [], [], []],
        "3": [3, "Into the Keep", 22, 18, "A", "warrior,nobody", [["npc", 7, "Captain Hale", 100, "Old Hill", 56.3, 47.5, null]], [1, 2],
          [["npc", 50, 2], ["item", 60, 10], ["item", 61, 1]], [[9001, 1]], [[9002, 1], [9999, 1]], ["npc:7"]],
        "5": [5, "Lost Letter", 20, 16, "N", "", [["item", 61, "Torn Letter", null, "", null, null, KEEP]], [], [], [], [], []],
      },
      targets: {
        "npc:7": ["Captain Hale", null],
        "npc:50": ["Keep Lord", KEEP],
        "item:60": ["Red Bandana", null],
        "item:61": ["Torn Letter", KEEP],
      },
    },
    seenQuests: {
      seenOn: "2026-11-07",
      columns: ["title", "level", "minLevel", "objectives", "rewards", "choices"],
      quests: {
        "2": ["Second Step (Forever)", 20, 15, [], [], []],
        "3": ["Into the Keep!", 23, 18, [["npc", 50, 1]], [[9002, 3]], []],
      },
    },
  };
}

const ITEMS: ReadonlyMap<number, LootItemInfo> = new Map([
  [9001, { name: "Hale's Blade", slot: "one_hand", itemType: "Sword" }],
  [9002, { name: "Keep Shield", slot: "off_hand", itemType: "Shield" }],
]);
const ZONES: ReadonlyMap<number, WorldZone> = new Map([
  [100, { id: 100, name: "Hillshire", kind: "zone", continent: 0, parent: 0, bounds: [0, 1000, 0, 1000] } as WorldZone],
]);

function decoded(): DungeonQuest[] {
  return decodeDungeonQuests(files(), ITEMS, ZONES)(KEEP);
}

describe("decodeDungeonQuests", () => {
  it("lists the instance's quests in the file's order, skipping ids it doesn't have", () => {
    expect(decoded().map((q) => q.id)).toEqual([3, 5]);
    expect(decodeDungeonQuests(files(), ITEMS, ZONES)(99)).toEqual([]);
  });

  it("prefers what the Forever client saw for title, levels, objectives and rewards", () => {
    const [quest] = decoded();
    expect(quest.title).toBe("Into the Keep!");
    expect(quest.level).toBe(23);
    expect(quest.objectives).toEqual([{ kind: "npc", name: "Keep Lord", count: 1, insideDungeon: true }]);
    expect(quest.rewards).toEqual([{ id: 9002, name: "Keep Shield", count: 3 }]);
    expect(quest.choices).toEqual([]);
    expect(quest.seenOn).toBe("2026-11-07");
  });

  it("keeps Classic facts for a quest the client hasn't seen, dropping rewards with no Forever name", () => {
    const unseen = files();
    unseen.seenQuests.quests = {};
    const [quest] = decodeDungeonQuests(unseen, ITEMS, ZONES)(KEEP);
    expect(quest.title).toBe("Into the Keep");
    expect(quest.objectives.map((o) => [o.name, o.count, o.insideDungeon])).toEqual([
      ["Keep Lord", 2, true],
      ["Red Bandana", 10, false],
      ["Torn Letter", 1, true],
    ]);
    expect(quest.rewards).toEqual([{ id: 9001, name: "Hale's Blade", count: 1 }]);
    expect(quest.choices).toEqual([{ id: 9002, name: "Keep Shield", count: 1 }]);
    expect(quest.seenOn).toBeNull();
  });

  it("places givers on their zone, marks inside ones, and names the chain and enders", () => {
    const [quest, letter] = decoded();
    expect(quest.givers).toEqual([
      { kind: "npc", name: "Captain Hale", place: { zoneId: 100, zoneName: "Hillshire", subzone: "Old Hill", x: 56.3, y: 47.5 }, insideDungeon: false },
    ]);
    expect(quest.chain).toEqual([
      { id: 1, title: "Lead In", level: 18, giver: "Old Scout" },
      { id: 2, title: "Second Step (Forever)", level: 20, giver: null },
    ]);
    expect(quest.enders).toEqual(["Captain Hale"]);
    expect(quest.classes).toEqual(["warrior"]);
    expect(letter.givers).toEqual([{ kind: "item", name: "Torn Letter", place: null, insideDungeon: true }]);
    expect(letter.side).toBe("N");
  });

  it("throws on a missing column", () => {
    const broken = files();
    broken.quests.questColumns = QUEST_COLUMNS.filter((c) => c !== "givers");
    expect(() => decodeDungeonQuests(broken, ITEMS, ZONES)).toThrow(/dungeonQuests.json: missing column givers/);
  });
});

describe("quest text, links and badges", () => {
  it("filters by faction, keeping quests for both sides", () => {
    const quests = decoded();
    expect(questsForFaction(quests, "A").map((q) => q.id)).toEqual([3, 5]);
    expect(questsForFaction(quests, "H").map((q) => q.id)).toEqual([5]);
  });

  it("formats levels, classes, objectives and counts", () => {
    expect(questLevelText({ level: 23, minLevel: 18 })).toBe("Level 23 · from level 18");
    expect(questLevelText({ level: 60, minLevel: 60 })).toBe("Level 60");
    expect(questClassesText({ classes: ["warrior", "paladin"] })).toBe("Warrior, Paladin");
    expect(objectiveText({ kind: "npc", name: "Edwin VanCleef", count: 1 })).toBe("Kill Edwin VanCleef");
    expect(objectiveText({ kind: "item", name: "Red Silk Bandana", count: 10 })).toBe("Collect Red Silk Bandana × 10");
    expect(objectiveText({ kind: "object", name: "Altar", count: 1 })).toBe("Use Altar");
    expect(rewardCountText(1)).toBe("");
    expect(rewardCountText(5)).toBe("× 5");
  });

  it("links a giver to the World Map, zoomed in with one read-only mark on it", () => {
    const href = questGiverMapHref("Captain Hale", { zoneId: 100, zoneName: "Hillshire", subzone: "", x: 56.3, y: 47.5 });
    expect(href.startsWith(`${WORLD_MAP_PAGE_PATH}?m=100#view=1~100~`)).toBe(true);
    const view = decodeMapViewFragment(href.slice(href.indexOf("#")));
    expect(view?.mapId).toBe(100);
    expect(view?.viewport.scale).toBe(QUEST_GIVER_MAP_SCALE);
    expect(view?.marks.marks.map((m) => [m.label, m.x, m.y, m.style])).toEqual([["Captain Hale", 56.3, 47.5, "quest"]]);
  });

  it("tags seen quests with the day, never shifted by the time zone, and the rest as Classic", () => {
    expect(questProvenance(null)).toEqual({ provenance: "classic" });
    const seen = questProvenance("2026-11-07");
    expect(seen.provenance).toBe("seen");
    expect(seen.date).toBe(new Date(Date.UTC(2026, 10, 7)).toLocaleDateString(undefined, { timeZone: "UTC" }));
  });
});

describe("the Quests section", () => {
  beforeEach(() => window.localStorage.clear());

  function renderSection(quests: DungeonQuest[]) {
    return render(
      <MemoryRouter>
        <DungeonQuests dungeon={{ quests }} />
      </MemoryRouter>,
    );
  }

  it("opens a quest to its giver, chain, objectives inside the dungeon and rewards", async () => {
    renderSection(decoded());
    const rows = screen.getAllByTestId("dungeon-quest-row");
    expect(rows).toHaveLength(2);
    const toggle = within(rows[0]).getByTestId("dungeon-quest-toggle");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const details = within(rows[0]).getByTestId("dungeon-quest-details");
    expect(within(details).getByTestId("quest-giver-map-link").getAttribute("href")).toMatch(/^\/wow-forever\/map\?m=100#view=1~/);
    expect(within(details).getByRole("link", { name: /Directions/ }).getAttribute("href")).toContain("dir=1");
    const chain = within(details).getAllByRole("listitem").filter((li) => li.closest("[data-testid=quest-chain]"));
    expect(chain.map((li) => li.textContent)).toEqual(["Lead In · level 18 · from Old Scout","Second Step (Forever) · level 20", "Into the Keep! · this quest"]);
    const objective = within(details).getByTestId("quest-objective");
    expect(objective).toHaveAttribute("data-inside", "true");
    expect(within(objective).getByTestId("quest-inside-dungeon")).toBeInTheDocument();
    expect(within(details).getByRole("link", { name: "Keep Shield" }).getAttribute("href")).toBe("/wow-forever/items/9002");
    const badges = within(rows[0]).getAllByTestId("provenance-badge").map((b) => b.getAttribute("data-provenance"));
    expect(badges).toContain("seen");
    expect(badges).toContain("classic");
  });

  it("follows the saved faction, and the toggle changes it", async () => {
    window.localStorage.setItem(PLAYER_SETTINGS_STORAGE_KEY, JSON.stringify({ faction: "H", classId: "warlock", zoneId: null, level: null, position: null }));
    renderSection(decoded());
    expect(screen.getAllByTestId("dungeon-quest-row").map((r) => r.getAttribute("data-quest-id"))).toEqual(["5"]);
    await userEvent.click(screen.getByRole("radio", { name: "Alliance" }));
    expect(screen.getAllByTestId("dungeon-quest-row")).toHaveLength(2);
  });

  it("says when there are no quests", () => {
    renderSection([]);
    expect(screen.getByText("No quests for this dungeon in our data yet.")).toBeInTheDocument();
  });
});

describe("the committed quest data", () => {
  it("gives every dungeon quests, with The Defias Brotherhood's chain, giver and seen rewards", async () => {
    const data = await loadDungeons();
    for (const d of data.dungeons) {
      expect(d.quests.length, d.name).toBeGreaterThan(0);
      for (const q of d.quests) {
        expect(q.title).not.toBe("");
        expect(q.level).toBeGreaterThan(0);
        for (const r of [...q.rewards, ...q.choices]) expect(r.name).not.toBe("");
      }
    }
    const vc = findDungeon(data, "deadmines")?.quests.find((q) => q.id === 166);
    expect(vc?.givers[0]).toMatchObject({ name: "Gryan Stoutmantle", place: { zoneId: 1436, zoneName: "Westfall" } });
    expect(vc?.chain.length).toBeGreaterThan(0);
    expect(vc?.seenOn).not.toBeNull();
    expect(vc?.choices.map((c) => c.id)).toContain(6087);
    const gnomeregan = findDungeon(data, "gnomeregan")?.quests ?? [];
    expect(gnomeregan.filter((q) => q.title === "The Sparklematic 5200!")).toHaveLength(1);
  });
});
