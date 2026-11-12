/**
 * WoW Forever "Your character" — lookup by name, remembered names, the gear
 * sheet with rolled stats, empty and two-hand sockets, errors, setting MGA's
 * pages to the character, and the stats panel (class default tab, gear bonus,
 * remembered tab, hands without weapons), and the talents panel (point split,
 * rank text, the calculator link, failures and unknown talents).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { RECENT_CHARACTERS_STORAGE_KEY } from "@/games/wow-forever/data/character/characterConfig";
import { CHARACTER_STATS_TAB_STORAGE_KEY } from "@/games/wow-forever/data/character/characterStatsConfig";
import { CALCULATOR_ILLEGAL_REASON, CALCULATOR_UNKNOWN_REASON } from "@/games/wow-forever/data/character/characterTalentsConfig";
import { PLAYER_SETTINGS_STORAGE_KEY } from "@/games/wow-forever/hooks/usePlayerSettings";
import {
  groupKnownRecipes,
  guideProfession,
  professionGuideHref,
  recipeColorAt,
  recipeSpell,
} from "@/games/wow-forever/lib/character/characterProfessions";
import { pickedTalent } from "@/games/wow-forever/lib/character/characterTalents";
import { characterNameFromSlug, characterSlugFromName } from "@/games/wow-forever/lib/character/characterSlug";
import { withRecentCharacter } from "@/games/wow-forever/lib/character/recentCharacters";
import WowCharacterPage from "@/games/wow-forever/pages/WowCharacterPage";
import type { CharacterItem } from "@/games/wow-forever/types/character/characterItem";
import type { CharacterResponse } from "@/games/wow-forever/types/character/characterResponse";
import type { CharacterStats } from "@/games/wow-forever/types/character/characterStats";

const mockQuery = vi.fn();
vi.mock("@/games/wow-forever/api/wowCharacterApi", () => ({
  useGetCharacterQuery: (slug: string, opts: { skip: boolean }) => mockQuery(slug, opts),
}));

function item(overrides: Partial<CharacterItem>): CharacterItem {
  return {
    slot: "HEAD",
    item_id: 3556,
    name: "Dread Mage Hat",
    quality: "uncommon",
    item_level: 30,
    inventory_type: "HEAD",
    inventory_type_name: "Head",
    subclass_name: "Cloth",
    binding: "Binds when picked up",
    armor: "35 Armor",
    weapon: null,
    stats: [
      { text: "+7 Intellect", equip_bonus: false },
      { text: "+7 Spirit", equip_bonus: true },
    ],
    enchantments: [],
    spells: [],
    set_name: null,
    requirements: ["Classes: Warlock"],
    durability: "Durability 21 / 45",
    durability_low: true,
    description: null,
    ...overrides,
  };
}

const STATS: CharacterStats = {
  health: 1032,
  power: 1295,
  power_type: "Mana",
  strength: { base: 33, effective: 33 },
  agility: { base: 38, effective: 41 },
  stamina: { base: 52, effective: 80 },
  intellect: { base: 74, effective: 92 },
  spirit: { base: 77, effective: 99 },
  melee: {
    attack_power: 23,
    main_hand: { min: 54, max: 81, speed: 3.4, dps: 19.9 },
    off_hand: null,
    crit: 4.93,
    hit: 0,
    haste: 0,
    expertise: 0,
  },
  ranged: { attack_power: 0, damage: { min: 21, max: 39, speed: null, dps: null }, crit: 5.1, hit: 0, haste: 0 },
  spell: { power: 11, healing: 11, crit: 6.37, hit: 0, haste: 0, penetration: 0, mana_regen: 16, mana_regen_casting: 0 },
  defenses: {
    armor: { base: 82, effective: 312 },
    defense: { base: 185, effective: 185 },
    dodge: 3.86,
    parry: 0,
    block: 0,
  },
  resistances: { arcane: 0, fire: 0, frost: 0, nature: 0, shadow: 10 },
  movement_speed: 100,
};

/** A real level 37 Affliction warlock's 28 points (Blizzard's ids, as in the tree files). */
const PICKS = [
  { id: 135456, rank: 2 },
  { id: 135455, rank: 5 },
  { id: 135451, rank: 3 },
  { id: 135450, rank: 2 },
  { id: 135448, rank: 3 },
  { id: 142628, rank: 5 },
  { id: 135445, rank: 1 },
  { id: 135443, rank: 1 },
  { id: 135442, rank: 3 },
  { id: 135441, rank: 3 },
];

const CHARACTER: CharacterResponse = {
  slug: "jason-kwon",
  name: "Jason",
  surname: "Kwon",
  level: 37,
  race: "Gnome",
  class_id: 9,
  class_name: "Warlock",
  gender: "Female",
  faction: "alliance",
  guild: "topdeadcenter",
  ruleset: "PvP",
  equipped_item_level: 28,
  last_login: new Date(Date.now() - 2 * 3_600_000).toISOString(),
  has_render: true,
  items: [
    item({}),
    item({
      slot: "MAIN_HAND",
      item_id: 1155,
      name: "Rod of the Sleepwalker",
      quality: "rare",
      inventory_type: "TWOHWEAPON",
      inventory_type_name: "Two-Hand",
      subclass_name: "Staff",
      armor: null,
      weapon: { damage: "54 - 81 Damage", speed: "Speed 3.40", dps: "(19.9 damage per second)" },
      stats: [],
      spells: ["Equip: Increases damage and healing done by magical spells and effects by up to 11."],
      durability: "Durability 60 / 65",
      durability_low: false,
      description: "It hums.",
    }),
  ],
  stats: STATS,
  talents: { groups: [{ active: true, picks: PICKS }] },
  professions: {
    primaries: [
      {
        id: 197,
        name: "Tailoring",
        skill: 60,
        max_skill: 150,
        recipes: [
          { id: 2359, name: "Bolt of Linen Cloth" },
          { id: 2408, name: "Brown Linen Pants" },
          { id: 2361, name: "Brown Linen Vest" },
          { id: 2380, name: "Handstitched Linen Britches" },
          { id: 999999, name: "Mystery Weave" },
        ],
      },
      {
        id: 333,
        name: "Enchanting",
        skill: 30,
        max_skill: 75,
        recipes: [
          { id: 7316, name: "Disenchant" },
          { id: 4289, name: "Enchant Bracer - Minor Health" },
        ],
      },
    ],
    secondaries: [
      {
        id: 185,
        name: "Cooking",
        skill: 187,
        max_skill: 225,
        recipes: [
          { id: 3964, name: "Boiled Clams" },
          { id: 2795, name: "Beer Basted Boar Ribs" },
        ],
      },
      { id: 356, name: "Fishing", skill: 1, max_skill: 75, recipes: [{ id: 7620, name: "Fishing" }] },
    ],
  },
};

function query(extra: Record<string, unknown>) {
  return { data: undefined, error: undefined, isFetching: false, ...extra };
}

function LocationProbe() {
  return <span data-testid="location">{useLocation().pathname}</span>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/wow-forever/character" element={<WowCharacterPage />} />
        <Route path="/wow-forever/character/:slug" element={<WowCharacterPage />} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  mockQuery.mockReturnValue(query({}));
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("character names", () => {
  it("turns a typed name into Blizzard's first-surname address", () => {
    expect(characterSlugFromName("  Jason Kwon ")).toBe("jason-kwon");
    expect(characterSlugFromName("Zoë Ashford")).toBe("zoë-ashford");
    expect(characterSlugFromName("jason-kwon")).toBe("jason-kwon");
    expect(characterSlugFromName("Jason")).toBeNull();
    expect(characterSlugFromName("Jason Kwon Smith")).toBeNull();
    expect(characterSlugFromName("Jas0n Kwon")).toBeNull();
    expect(characterNameFromSlug("jason-kwon")).toBe("Jason Kwon");
  });

  it("keeps the newest name first, without repeats, up to five", () => {
    expect(withRecentCharacter(["a-b", "c-d"], "c-d")).toEqual(["c-d", "a-b"]);
    expect(withRecentCharacter(["aa-a", "bb-b", "cc-c", "dd-d", "ee-e"], "ff-f")).toHaveLength(5);
  });
});

describe("WowCharacterPage", () => {
  it("looks up a typed name and opens its page", () => {
    renderAt("/wow-forever/character");
    expect(mockQuery).toHaveBeenCalledWith("", { skip: true });
    fireEvent.change(screen.getByLabelText(/character name/i), { target: { value: "Jason Kwon" } });
    fireEvent.click(screen.getByRole("button", { name: "Look up" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/wow-forever/character/jason-kwon");
    expect(mockQuery).toHaveBeenLastCalledWith("jason-kwon", { skip: false });
  });

  it("asks for both names when only one is typed, and looks nothing up", () => {
    renderAt("/wow-forever/character");
    fireEvent.change(screen.getByLabelText(/character name/i), { target: { value: "Jason" } });
    fireEvent.click(screen.getByRole("button", { name: "Look up" }));
    expect(screen.getByText(/first name and surname, like/i)).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent(/^\/wow-forever\/character$/);
  });

  it("shows the sheet: who they are, the picture and each item's rolled stats", () => {
    mockQuery.mockReturnValue(query({ data: CHARACTER }));
    renderAt("/wow-forever/character/jason-kwon");
    expect(screen.getByRole("heading", { name: "Jason Kwon" })).toBeInTheDocument();
    expect(screen.getByText(/Level 37 Gnome Warlock/)).toBeInTheDocument();
    expect(screen.getByText("<topdeadcenter>")).toBeInTheDocument();
    expect(screen.getByText(/From their last log out, 2 hours ago/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Jason Kwon in their current gear/ })).toHaveAttribute(
      "src",
      "/api/wow/characters/jason-kwon/render.png",
    );
    const hat = screen.getByRole("button", { name: /Dread Mage Hat/ });
    expect(within(hat).getByText("+7 Spirit")).toHaveClass("text-green-700");
    expect(within(hat).getByText("Repair soon")).toBeInTheDocument();
  });

  it("opens an item to its full tooltip", () => {
    mockQuery.mockReturnValue(query({ data: CHARACTER }));
    renderAt("/wow-forever/character/jason-kwon");
    const staff = screen.getByRole("button", { name: /Rod of the Sleepwalker/ });
    expect(staff).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(staff);
    const details = screen.getByTestId("character-item-details");
    expect(within(details).getByText(/Increases damage and healing/)).toBeInTheDocument();
    expect(within(details).getByText(/54 - 81 Damage/)).toBeInTheDocument();
    expect(within(details).getByText(/It hums/)).toBeInTheDocument();
  });

  it("draws empty sockets, the off hand a two-hander fills, and no empty ammo slot", () => {
    mockQuery.mockReturnValue(query({ data: CHARACTER }));
    renderAt("/wow-forever/character/jason-kwon");
    expect(screen.getByText("Two-hand weapon equipped")).toBeInTheDocument();
    const left = screen.getByRole("list", { name: "Left side" });
    expect(within(left).getAllByText("Empty")).toHaveLength(7); // every left slot but Head
    expect(screen.queryByText(/Ammo:/)).not.toBeInTheDocument();
  });

  it("remembers a name once Blizzard knows it, and reopens it next visit", () => {
    mockQuery.mockReturnValue(query({ data: CHARACTER }));
    const { unmount } = renderAt("/wow-forever/character/jason-kwon");
    expect(JSON.parse(window.localStorage.getItem(RECENT_CHARACTERS_STORAGE_KEY) ?? "[]")).toEqual(["jason-kwon"]);
    unmount();
    renderAt("/wow-forever/character");
    expect(screen.getByTestId("location")).toHaveTextContent("/wow-forever/character/jason-kwon");
    expect(screen.getByRole("button", { name: "Jason Kwon" })).toHaveAttribute("aria-pressed", "true");
  });

  it("never remembers a name Blizzard doesn't know, and says how to fix it", () => {
    mockQuery.mockReturnValue(query({ error: { status: 404, data: { detail: "character_not_found" } } }));
    renderAt("/wow-forever/character/nobody-here");
    expect(screen.getByRole("alert")).toHaveTextContent(/no character by that name/i);
    expect(window.localStorage.getItem(RECENT_CHARACTERS_STORAGE_KEY)).toBeNull();
  });

  it("says Blizzard didn't answer on a 502", () => {
    mockQuery.mockReturnValue(query({ error: { status: 502, data: {} } }));
    renderAt("/wow-forever/character/jason-kwon");
    expect(screen.getByRole("alert")).toHaveTextContent(/didn't answer/i);
  });

  it("shows the sheet's skeleton while Blizzard answers", () => {
    mockQuery.mockReturnValue(query({ isFetching: true }));
    renderAt("/wow-forever/character/jason-kwon");
    expect(screen.getByTestId("character-sheet-skeleton")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Looking up/ })).toBeDisabled();
  });

  it("sets MGA's pages to the character's faction, class and level", () => {
    mockQuery.mockReturnValue(query({ data: CHARACTER }));
    renderAt("/wow-forever/character/jason-kwon");
    fireEvent.click(screen.getByRole("button", { name: "Use for MGA's pages" }));
    const saved = JSON.parse(window.localStorage.getItem(PLAYER_SETTINGS_STORAGE_KEY) ?? "{}");
    expect(saved).toMatchObject({ faction: "A", classId: "warlock", level: 37 });
    expect(screen.getByRole("button", { name: /MGA's pages use this character/ })).toBeDisabled();
  });
});

describe("the stats panel", () => {
  it("opens a warlock on Spell, with what gear adds in green", () => {
    mockQuery.mockReturnValue(query({ data: CHARACTER }));
    renderAt("/wow-forever/character/jason-kwon");
    const panel = screen.getByRole("region", { name: "Character stats" });
    expect(within(panel).getByRole("tab", { name: "Spell" })).toHaveAttribute("aria-selected", "true");
    expect(within(panel).getByText("6.37%")).toBeInTheDocument();
    expect(within(panel).getByText("Mana regen while casting")).toBeInTheDocument();
    expect(within(panel).queryByText("Haste")).not.toBeInTheDocument();
    const attributes = within(panel).getByLabelText("Attributes");
    expect(within(attributes).getByText("92")).toBeInTheDocument();
    expect(within(attributes).getByText(/\+18/)).toHaveTextContent("(+18 from gear, talents and buffs)");
    expect(within(panel).getByLabelText("Summary")).toHaveTextContent("Mana1,295");
    expect(within(panel).getByLabelText("Summary")).not.toHaveTextContent("Armor");
    expect(within(panel).queryByText("Run speed")).not.toBeInTheDocument();
    expect(within(panel).getByLabelText("Resistances")).toHaveTextContent("Shadow10");
  });

  it("remembers the picked tab; Melee shows only the hand holding a weapon", () => {
    mockQuery.mockReturnValue(query({ data: CHARACTER }));
    renderAt("/wow-forever/character/jason-kwon");
    fireEvent.click(screen.getByRole("tab", { name: "Melee" }));
    const melee = screen.getByLabelText("Melee stats");
    expect(melee).toHaveTextContent("Main hand damage54 – 81");
    expect(melee).toHaveTextContent("Main hand DPS19.9");
    expect(melee).not.toHaveTextContent("Off hand");
    expect(JSON.parse(window.localStorage.getItem(CHARACTER_STATS_TAB_STORAGE_KEY) ?? "null")).toBe("melee");
  });

  it("moves between tabs with the arrow keys", () => {
    mockQuery.mockReturnValue(query({ data: CHARACTER }));
    renderAt("/wow-forever/character/jason-kwon");
    const spell = screen.getByRole("tab", { name: "Spell" });
    fireEvent.keyDown(spell, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Defenses" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Defenses" })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("tab", { name: "Defenses" }), { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Melee" })).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(screen.getByRole("tab", { name: "Melee" }), { key: "End" });
    expect(screen.getByRole("tab", { name: "Defenses" })).toHaveAttribute("aria-selected", "true");
  });

  it("opens a hunter on Ranged and a warrior on Melee", () => {
    mockQuery.mockReturnValue(query({ data: { ...CHARACTER, class_name: "Hunter" } }));
    const { unmount } = renderAt("/wow-forever/character/jason-kwon");
    expect(screen.getByRole("tab", { name: "Ranged" })).toHaveAttribute("aria-selected", "true");
    unmount();
    mockQuery.mockReturnValue(query({ data: { ...CHARACTER, class_name: "Warrior" } }));
    renderAt("/wow-forever/character/jason-kwon");
    expect(screen.getByRole("tab", { name: "Melee" })).toHaveAttribute("aria-selected", "true");
  });

  it("says how to get stats when Blizzard has none yet", () => {
    mockQuery.mockReturnValue(query({ data: { ...CHARACTER, stats: null } }));
    renderAt("/wow-forever/character/jason-kwon");
    expect(screen.getByText(/doesn't have this character's stats yet/)).toBeInTheDocument();
    expect(screen.queryByRole("tablist", { name: "Stat group" })).not.toBeInTheDocument();
  });
});

describe("the talents panel", () => {
  async function talentsFor(data: CharacterResponse) {
    mockQuery.mockReturnValue(query({ data }));
    renderAt("/wow-forever/character/jason-kwon");
    const panel = screen.getByRole("region", { name: "Talents" });
    await waitFor(() => expect(within(panel).queryByTestId("character-talents-skeleton")).not.toBeInTheDocument());
    return panel;
  }

  it("draws each tree as the game's grid with the character's ranks and a calculator link", async () => {
    const panel = await talentsFor(CHARACTER);
    const split = within(panel).getByTestId("character-talent-split");
    expect(split).toHaveTextContent("Affliction 28");
    expect(split).toHaveTextContent("Demonology 0");
    expect(split).toHaveTextContent("Destruction 0");
    const cells = within(panel).getAllByTestId("character-talent-cell");
    expect(cells.filter((cell) => cell.dataset.rank !== "0")).toHaveLength(10);
    expect(within(panel).getAllByTestId("talent-tree")).toHaveLength(3);
    expect(within(panel).getByRole("heading", { level: 3, name: "Affliction" })).toBeInTheDocument();
    const demonology = within(panel).getByRole("region", { name: "Demonology talents" });
    expect(within(demonology).getByTestId("talent-tree-points")).toHaveTextContent("0 points");
    expect(within(panel).getByRole("button", { name: "Suppression, rank 2 of 5" })).toHaveAttribute("data-state", "partial");
    expect(within(panel).getByRole("button", { name: "Improved Corruption, rank 5 of 5" })).toHaveAttribute("data-state", "maxed");
    expect(within(panel).getByRole("link", { name: "Open in the talent calculator" })).toHaveAttribute(
      "href",
      "/wow-forever/talents/warlock?b=2-0250032003510133--&lvl=37",
    );
    expect(within(panel).queryByTestId("character-talents-unspent")).not.toBeInTheDocument();
  });

  it("opens a talent to the text of the rank the character has, and closes it again", async () => {
    const panel = await talentsFor(CHARACTER);
    const details = within(panel).getByTestId("character-talent-details");
    expect(details).toHaveTextContent("Tap a talent to see what it does.");
    const suppression = within(panel).getByRole("button", { name: "Suppression, rank 2 of 5" });
    fireEvent.click(suppression);
    expect(suppression).toHaveAttribute("aria-pressed", "true");
    expect(details).toHaveTextContent("Suppression");
    expect(details).toHaveTextContent("Rank 2/5");
    expect(details).toHaveTextContent(/2%/);
    fireEvent.click(suppression);
    expect(suppression).toHaveAttribute("aria-pressed", "false");
    expect(details).toHaveTextContent("Tap a talent to see what it does.");
    fireEvent.click(suppression);
    fireEvent.keyDown(suppression, { key: "Escape" });
    expect(details).toHaveTextContent("Tap a talent to see what it does.");
  });

  it("starts fresh on another character: nothing open", async () => {
    const answers: Record<string, ReturnType<typeof query>> = {
      "jason-kwon": query({ data: CHARACTER }),
      "someone-else": query({ data: { ...CHARACTER, slug: "someone-else" } }),
    };
    mockQuery.mockImplementation((slug: string) => answers[slug] ?? query({}));
    renderAt("/wow-forever/character/jason-kwon");
    const panel = screen.getByRole("region", { name: "Talents" });
    fireEvent.click(await within(panel).findByRole("button", { name: "Suppression, rank 2 of 5" }));
    expect(within(panel).getByTestId("character-talent-details")).toHaveTextContent("Rank 2/5");
    fireEvent.change(screen.getByLabelText(/character name/i), { target: { value: "Someone Else" } });
    fireEvent.click(screen.getByRole("button", { name: "Look up" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/wow-forever/character/someone-else");
    const details = await within(screen.getByRole("region", { name: "Talents" })).findByTestId("character-talent-details");
    expect(details).toHaveTextContent("Tap a talent to see what it does.");
  });

  it("opens nothing for a talent position the trees don't have", () => {
    const trees = [{ talents: [] }] as unknown as Parameters<typeof pickedTalent>[0];
    expect(pickedTalent(trees, [[]], { tree: 0, talent: 4 })).toBeNull();
    expect(pickedTalent(trees, [[]], { tree: 2, talent: 0 })).toBeNull();
  });

  it("names a talent whose row isn't open yet for screen readers", async () => {
    const panel = await talentsFor(CHARACTER);
    const demonology = within(panel).getByRole("region", { name: "Demonology talents" });
    const locked = within(demonology).getAllByRole("button").filter((cell) => cell.dataset.state === "locked");
    expect(locked.length).toBeGreaterThan(0);
    expect(locked[0]).toHaveAccessibleName(/, rank 0 of \d, not open yet$/);
  });

  it("can't add or remove points: a click only opens the talent", async () => {
    const panel = await talentsFor(CHARACTER);
    const demonology = within(panel).getByRole("region", { name: "Demonology talents" });
    const open = within(demonology).getAllByRole("button").find((cell) => cell.dataset.state === "open");
    fireEvent.click(open!);
    fireEvent.contextMenu(open!);
    expect(open).toHaveAttribute("data-rank", "0");
    expect(within(demonology).getByTestId("talent-tree-points")).toHaveTextContent("0 points");
  });

  it("counts points not spent yet and links at the character's level", async () => {
    const panel = await talentsFor({ ...CHARACTER, level: 40 });
    expect(within(panel).getByTestId("character-talents-unspent")).toHaveTextContent("3 points not spent yet.");
    expect(within(panel).getByRole("link", { name: "Open in the talent calculator" })).toHaveAttribute(
      "href",
      expect.stringContaining("lvl=40"),
    );
  });

  it("counts talents missing from our trees and doesn't link a build it can't show whole", async () => {
    const picks = [...PICKS, { id: 999_999, rank: 1 }];
    const panel = await talentsFor({ ...CHARACTER, talents: { groups: [{ active: true, picks }] } });
    expect(within(panel).getByTestId("character-talents-unknown")).toHaveTextContent("1 talent isn't in our copy");
    expect(within(panel).queryByRole("link", { name: "Open in the talent calculator" })).not.toBeInTheDocument();
    expect(within(panel).getByTestId("character-talents-no-link")).toHaveTextContent(CALCULATOR_UNKNOWN_REASON);
  });

  it("counts a rank above the talent's top rank as unknown", async () => {
    const picks = [...PICKS.filter((pick) => pick.id !== 135456), { id: 135456, rank: 9 }];
    const panel = await talentsFor({ ...CHARACTER, talents: { groups: [{ active: true, picks }] } });
    expect(within(panel).getByTestId("character-talents-unknown")).toHaveTextContent("1 talent isn't in our copy");
    expect(within(panel).getByTestId("character-talents-no-link")).toBeInTheDocument();
  });

  it("explains a class it has no talent trees for", async () => {
    const panel = await talentsFor({ ...CHARACTER, class_name: "Monk" });
    expect(within(panel).getByTestId("character-talents-note")).toBeInTheDocument();
    expect(within(panel).queryByTestId("character-talent-set")).not.toBeInTheDocument();
  });

  it("says why there's no link when the calculator wouldn't take the build", async () => {
    const picks = [{ id: 135441, rank: 3 }]; // a tier 6 talent with nothing above it
    const panel = await talentsFor({ ...CHARACTER, talents: { groups: [{ active: true, picks }] } });
    expect(within(panel).queryByRole("link", { name: "Open in the talent calculator" })).not.toBeInTheDocument();
    expect(within(panel).getByTestId("character-talents-no-link")).toHaveTextContent(CALCULATOR_ILLEGAL_REASON);
  });

  it("heads each saved set when the character has two", async () => {
    const other = { active: false, picks: [{ id: 135456, rank: 1 }] };
    const panel = await talentsFor({ ...CHARACTER, talents: { groups: [{ active: true, picks: PICKS }, other] } });
    await waitFor(() => expect(within(panel).getAllByTestId("character-talent-set")).toHaveLength(2));
    expect(within(panel).getByRole("heading", { name: "Active talents" })).toBeInTheDocument();
    expect(within(panel).getByRole("heading", { name: "Other saved talents" })).toBeInTheDocument();
  });

  it("says Blizzard sent no talents and keeps the rest of the sheet", async () => {
    const failed = await talentsFor({ ...CHARACTER, talents: null });
    expect(within(failed).getByTestId("character-talents-note")).toHaveTextContent("Blizzard didn't send");
    expect(screen.getByRole("region", { name: "Character stats" })).toBeInTheDocument();
  });

  it("says no points are spent for a character under level 10", async () => {
    const panel = await talentsFor({ ...CHARACTER, level: 8, talents: { groups: [] } });
    expect(within(panel).getByTestId("character-talents-note")).toHaveTextContent("No talent points spent yet");
  });
});

describe("the professions panel", () => {
  function professionsFor(data: CharacterResponse) {
    mockQuery.mockReturnValue(query({ data }));
    renderAt("/wow-forever/character/jason-kwon");
    return screen.getByRole("region", { name: "Professions" });
  }

  it("lists each profession's skill out of its rank's cap, all closed", () => {
    const panel = professionsFor(CHARACTER);
    expect(within(panel).getByRole("heading", { name: "Main professions" })).toBeInTheDocument();
    expect(within(panel).getByRole("heading", { name: "Secondary" })).toBeInTheDocument();
    const skills = within(panel).getAllByTestId("character-profession-skill").map((el) => el.textContent);
    expect(skills).toEqual(["60 / 150", "30 / 75", "187 / 225", "1 / 75"]);
    const tailoring = within(panel).getByRole("button", { name: /Tailoring/ });
    expect(tailoring).toHaveAttribute("aria-expanded", "false");
    expect(tailoring).toHaveTextContent("5 recipes known");
    // Fishing knows only "Fishing": nothing to open.
    expect(within(panel).queryByRole("button", { name: /Fishing/ })).not.toBeInTheDocument();
  });

  it("opens a crafting profession to its recipes by colour at the character's skill, and closes it", async () => {
    const panel = professionsFor(CHARACTER);
    const button = within(panel).getByRole("button", { name: /Tailoring/ });
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    const recipes = within(panel).getByRole("region", { name: "Tailoring recipes" });
    await waitFor(() => expect(within(recipes).getAllByTestId("character-recipe-group")).toHaveLength(5));
    const groups = within(recipes).getAllByTestId("character-recipe-group");
    expect(groups.map((group) => group.dataset.color)).toEqual(["orange", "yellow", "green", "grey", "other"]);
    expect(groups[0]).toHaveTextContent("Orange · 1");
    expect(groups[0]).toHaveTextContent("Handstitched Linen Britches");
    expect(groups[1]).toHaveTextContent("Brown Linen Pants");
    expect(groups[2]).toHaveTextContent("Brown Linen Vest");
    expect(groups[3]).toHaveTextContent("Gray · 1");
    expect(groups[4]).toHaveTextContent("Other · 1");
    expect(groups[4]).toHaveTextContent("Mystery Weave");
    expect(within(recipes).getByRole("link", { name: "Tailoring guide from 60" })).toHaveAttribute(
      "href",
      "/wow-forever/professions?p=tailoring&skill=60",
    );
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "false");
  });

  it("keeps one profession open at a time", () => {
    const panel = professionsFor(CHARACTER);
    fireEvent.click(within(panel).getByRole("button", { name: /Tailoring/ }));
    fireEvent.click(within(panel).getByRole("button", { name: /Cooking/ }));
    expect(within(panel).getByRole("button", { name: /Tailoring/ })).toHaveAttribute("aria-expanded", "false");
    expect(within(panel).getByRole("button", { name: /Cooking/ })).toHaveAttribute("aria-expanded", "true");
  });

  it("doesn't colour Disenchant: it gives no skill-ups", async () => {
    const panel = professionsFor(CHARACTER);
    fireEvent.click(within(panel).getByRole("button", { name: /Enchanting/ }));
    const recipes = within(panel).getByRole("region", { name: "Enchanting recipes" });
    await waitFor(() => expect(within(recipes).getAllByTestId("character-recipe-group").length).toBeGreaterThan(1));
    const other = within(recipes).getAllByTestId("character-recipe-group").find((group) => group.dataset.color === "other");
    expect(other).toHaveTextContent("Disenchant");
  });

  it("lists a profession we can't colour yet as one plain list, linking its guide", () => {
    const panel = professionsFor(CHARACTER);
    fireEvent.click(within(panel).getByRole("button", { name: /Cooking/ }));
    const recipes = within(panel).getByRole("region", { name: "Cooking recipes" });
    const groups = within(recipes).getAllByTestId("character-recipe-group");
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveTextContent("Known recipes · 2");
    expect(within(groups[0]).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Beer Basted Boar Ribs",
      "Boiled Clams",
    ]);
    expect(within(recipes).getByRole("link", { name: "Cooking guide from 187" })).toHaveAttribute(
      "href",
      "/wow-forever/professions?p=cooking",
    );
  });

  it("says Blizzard sent no professions, or that the character has none", () => {
    const failed = professionsFor({ ...CHARACTER, professions: null });
    expect(within(failed).getByTestId("character-professions-note")).toHaveTextContent("Blizzard didn't send");
    expect(screen.getByRole("region", { name: "Talents" })).toBeInTheDocument();
  });

  it("says a character with no professions has learned none", () => {
    const panel = professionsFor({ ...CHARACTER, professions: { primaries: [], secondaries: [] } });
    expect(within(panel).getByTestId("character-professions-note")).toHaveTextContent("hasn't learned a profession");
  });

  it("colours a recipe as the game does: orange below yellow, green from half-way, gray at grey", () => {
    const pants = { yellow: 50, grey: 85 };
    expect(recipeColorAt(pants, 49)).toBe("orange");
    expect(recipeColorAt(pants, 50)).toBe("yellow");
    expect(recipeColorAt(pants, 68)).toBe("green");
    expect(recipeColorAt(pants, 85)).toBe("grey");
    expect(guideProfession(197)).toBe("tailoring");
    expect(guideProfession(12345)).toBeNull();
    expect(professionGuideHref("enchanting", 128)).toBe("/wow-forever/professions?p=enchanting&skill=128");
  });

  it("reads Blizzard's recipe ids as SkillLineAbility rows, never as spells", () => {
    // Live: Double-stitched Woolen Shoulders arrives as 2385, which is also Brown Linen Vest's spell.
    expect(recipeSpell(2385)).toBe(3848);
    expect(recipeSpell(2359)).toBe(2963);
    expect(recipeSpell(999999)).toBeNull();
    const lookup = new Map([
      [2385, { yellow: 10, grey: 40 }],
      [3848, { yellow: 120, grey: 160 }],
    ]);
    const groups = groupKnownRecipes([{ id: 2385, name: "Double-stitched Woolen Shoulders" }], 148, lookup);
    expect(groups).toEqual([{ color: "green", recipes: [{ id: 2385, name: "Double-stitched Woolen Shoulders" }] }]);
  });
});
