import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import ForeverDungeonQuests from "@/games/wow-forever/components/dungeons/foreverQuests/ForeverDungeonQuests";
import { FOREVER_DUNGEON_QUESTS_COPY } from "@/games/wow-forever/data/dungeons/dungeonPageConfig";
import { PLAYER_SETTINGS_STORAGE_KEY } from "@/games/wow-forever/hooks/usePlayerSettings";
import { foreverQuestRewardSummary, itemCountText, reputationText, standingText } from "@/games/wow-forever/lib/dungeons/describeForeverQuest";
import type { ForeverDungeonQuest } from "@/games/wow-forever/types/dungeons/foreverDungeonQuest";

function quest(over: Partial<ForeverDungeonQuest>): ForeverDungeonQuest {
  return {
    id: 1,
    title: "A Quest",
    side: "N",
    type: null,
    repeatable: false,
    classes: [],
    needsReputation: [],
    xp: 0,
    money: 0,
    reputations: [],
    items: [],
    itemsChoice: false,
    spell: null,
    description: "",
    seen: null,
    ...over,
  };
}

const ARCANE = quest({
  id: 92457,
  title: "Starving Arcane",
  side: "N",
  type: "Dungeon",
  xp: 3200,
  money: 18000,
  reputations: [{ faction: "Kirin Tor", amount: 250 }],
  items: [
    { id: 279837, name: "Arcane Band", count: 1 },
    { id: 279838, name: "Arcane Ring", count: 1 },
  ],
  itemsChoice: true,
  description: "Feed the arcane.\n\nQuickly.",
  seen: { level: 33, minLevel: 24, seenOn: "2026-11-12" },
});
const SPECIAL = quest({ id: 96828, title: "Special Access", side: "A", classes: ["Mage"], xp: 6000, spell: "Teleport: Dalaran" });
const BEARS = quest({
  id: 5,
  title: "The Twin Bears",
  side: "H",
  repeatable: true,
  needsReputation: [{ faction: "Timbermaw Hold", standing: "Neutral" }],
});

describe("Forever quest text", () => {
  it("sums up rewards: XP, money, items (a choice says so)", () => {
    expect(foreverQuestRewardSummary(ARCANE)).toBe("3,200 XP · 1g 80s · choice of 2 items");
    expect(foreverQuestRewardSummary({ xp: 0, money: 0, items: [{ id: 1, name: "x", count: 1 }], itemsChoice: false })).toBe("1 item");
    expect(foreverQuestRewardSummary({ xp: 0, money: 0, items: [], itemsChoice: false })).toBe("");
  });

  it("counts items, saying when they're a choice", () => {
    const item = { id: 1, name: "x", count: 1 };
    expect(itemCountText({ items: [], itemsChoice: false })).toBeNull();
    expect(itemCountText({ items: [item], itemsChoice: false })).toBe("1 item");
    expect(itemCountText({ items: [item, item, item], itemsChoice: false })).toBe("3 items");
    expect(itemCountText({ items: [item, item], itemsChoice: true })).toBe("choice of 2 items");
  });

  it("names a needed standing and a reputation gain or loss", () => {
    expect(standingText({ faction: "Timbermaw Hold", standing: "Neutral" })).toBe("Neutral or better with Timbermaw Hold");
    expect(reputationText({ faction: "Ironforge", amount: 100 })).toBe("+100 Ironforge");
    expect(reputationText({ faction: "Ironforge", amount: -25 })).toBe("-25 Ironforge");
  });
});

describe("the Forever Quests section", () => {
  beforeEach(() => window.localStorage.clear());

  function renderSection(foreverQuests: ForeverDungeonQuest[]) {
    return render(
      <MemoryRouter>
        <ForeverDungeonQuests dungeon={{ foreverQuests }} />
      </MemoryRouter>,
    );
  }

  it("says the quests are Blizzard's, and what Blizzard's data doesn't have", () => {
    renderSection([ARCANE]);
    expect(screen.getByText(FOREVER_DUNGEON_QUESTS_COPY.source)).toBeInTheDocument();
    expect(screen.getByText(FOREVER_DUNGEON_QUESTS_COPY.notInData)).toBeInTheDocument();
    expect(screen.getByText(FOREVER_DUNGEON_QUESTS_COPY.zoneQuests)).toBeInTheDocument();
  });

  it("shows a seen quest's level with its seen badge, and none for an unseen one", () => {
    window.localStorage.setItem(PLAYER_SETTINGS_STORAGE_KEY, JSON.stringify({ faction: "A", classId: "mage", zoneId: null, level: null, position: null }));
    renderSection([ARCANE, SPECIAL]);
    const [arcane, special] = screen.getAllByTestId("forever-quest-row");
    expect(arcane).toHaveTextContent("Level 33 · from level 24 · Both factions · 3,200 XP · 1g 80s · choice of 2 items");
    expect(within(arcane).getByTestId("forever-quest-seen")).toBeInTheDocument();
    expect(special).toHaveTextContent("Alliance · 6,000 XP");
    expect(special).not.toHaveTextContent("Level");
    expect(within(special).queryByTestId("forever-quest-seen")).toBeNull();
    expect(within(special).getByTestId("forever-quest-badges")).toHaveTextContent("Mage");
  });

  it("opens a quest to its text, its choice of items, reputation and spell", async () => {
    window.localStorage.setItem(PLAYER_SETTINGS_STORAGE_KEY, JSON.stringify({ faction: "A", classId: "mage", zoneId: null, level: null, position: null }));
    renderSection([ARCANE, SPECIAL]);
    const [arcane, special] = screen.getAllByTestId("forever-quest-toggle");
    expect(arcane).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(arcane);
    expect(arcane).toHaveAttribute("aria-expanded", "true");
    const details = screen.getByTestId("forever-quest-details");
    expect(details).toHaveTextContent("Feed the arcane.");
    expect(within(details).getByText("Choose one of")).toBeInTheDocument();
    expect(within(details).getAllByTestId("quest-reward-row").map((r) => r.textContent)).toEqual(["Arcane Band", "Arcane Ring"]);
    expect(within(details).getByTestId("forever-quest-reputations")).toHaveTextContent("+250 Kirin Tor");
    await userEvent.click(special);
    expect(screen.getByTestId("forever-quest-spell")).toHaveTextContent("Spell: Teleport: Dalaran");
  });

  it("opens a quest to the standing it needs, with its Repeatable chip", async () => {
    window.localStorage.setItem(PLAYER_SETTINGS_STORAGE_KEY, JSON.stringify({ faction: "H", classId: "warlock", zoneId: null, level: null, position: null }));
    renderSection([BEARS]);
    expect(screen.getByTestId("forever-quest-badges")).toHaveTextContent(FOREVER_DUNGEON_QUESTS_COPY.repeatable);
    await userEvent.click(screen.getByTestId("forever-quest-toggle"));
    expect(screen.getByTestId("forever-quest-details")).toHaveTextContent("Neutral or better with Timbermaw Hold");
  });

  it("follows the saved faction, and the toggle changes it", async () => {
    window.localStorage.setItem(PLAYER_SETTINGS_STORAGE_KEY, JSON.stringify({ faction: "H", classId: "warlock", zoneId: null, level: null, position: null }));
    renderSection([ARCANE, SPECIAL, BEARS]);
    expect(screen.getAllByTestId("forever-quest-row").map((r) => r.getAttribute("data-quest-id"))).toEqual(["92457", "5"]);
    await userEvent.click(screen.getByRole("radio", { name: "Alliance" }));
    expect(screen.getAllByTestId("forever-quest-row").map((r) => r.getAttribute("data-quest-id"))).toEqual(["92457", "96828"]);
  });

  it("says when Blizzard lists none, and when none are for your faction", () => {
    window.localStorage.setItem(PLAYER_SETTINGS_STORAGE_KEY, JSON.stringify({ faction: "H", classId: "warlock", zoneId: null, level: null, position: null }));
    const { unmount } = renderSection([]);
    expect(screen.getByText(FOREVER_DUNGEON_QUESTS_COPY.none)).toBeInTheDocument();
    expect(screen.queryByRole("radio")).toBeNull();
    unmount();
    renderSection([SPECIAL]);
    expect(screen.getByText(FOREVER_DUNGEON_QUESTS_COPY.noneForFaction)).toBeInTheDocument();
  });
});
