/**
 * WoW Forever "Your character" — lookup by name, remembered names, the gear
 * sheet with rolled stats, empty and two-hand sockets, errors, and setting
 * MGA's pages to the character.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { RECENT_CHARACTERS_STORAGE_KEY } from "@/games/wow-forever/data/character/characterConfig";
import { PLAYER_SETTINGS_STORAGE_KEY } from "@/games/wow-forever/hooks/usePlayerSettings";
import { characterNameFromSlug, characterSlugFromName } from "@/games/wow-forever/lib/character/characterSlug";
import { withRecentCharacter } from "@/games/wow-forever/lib/character/recentCharacters";
import WowCharacterPage from "@/games/wow-forever/pages/WowCharacterPage";
import type { CharacterItem } from "@/games/wow-forever/types/character/characterItem";
import type { CharacterResponse } from "@/games/wow-forever/types/character/characterResponse";

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
