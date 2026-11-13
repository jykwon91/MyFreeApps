/**
 * The Auction house item tooltip: hover (mouse) or tap shows the item's stats beside the gear the
 * saved character wears in its slot, with green/red deltas; without a saved character it says how
 * to compare; a failed character load is a short note; a tap outside closes it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AuctionItemName from "@/games/wow-forever/components/auctionHouse/AuctionItemName";
import { ITEM_TOOLTIP_HIDE_GRACE_MS, ITEM_TOOLTIP_SHOW_DELAY_MS } from "@/games/wow-forever/data/itemPages/itemTooltipConfig";
import { ITEM_TOOLTIP_STATUS } from "@/games/wow-forever/data/itemPages/itemTooltipStatus";
import { LOAD_STATUS } from "@/games/wow-forever/data/loadStatus";
import { PLAYER_SETTINGS_STORAGE_KEY } from "@/games/wow-forever/hooks/usePlayerSettings";
import type { CharacterItem } from "@/games/wow-forever/types/character/characterItem";
import type { CharacterResponse } from "@/games/wow-forever/types/character/characterResponse";
import type { ClientItem } from "@/games/wow-forever/types/clientItem";

const characterQuery = vi.hoisted(() => vi.fn());
vi.mock("@/games/wow-forever/api/wowCharacterApi", () => ({ useGetCharacterQuery: characterQuery }));

const clientItems = vi.hoisted(() => vi.fn());
vi.mock("@/games/wow-forever/hooks/useClientItems", () => ({ useClientItems: clientItems }));

const tooltipData = vi.hoisted(() => vi.fn());
vi.mock("@/games/wow-forever/hooks/useItemTooltipData", () => ({ useItemTooltipData: tooltipData }));

const RING_ID = 100;
const WORN_RING_ID = 200;
const BAND_ID = 201;

function clientItem(overrides: Partial<ClientItem>): ClientItem {
  return {
    id: RING_ID,
    name: "Ring of the Eagle",
    quality: "rare",
    slot: "finger",
    itemType: null,
    itemLevel: 40,
    requiredLevel: 35,
    armor: null,
    weapon: null,
    stats: { stamina: 12, intellect: 5 },
    classes: null,
    damageUnknown: false,
    otherEffects: 0,
    randomSuffix: false,
    ...overrides,
  };
}

const HOVERED = clientItem({});
const WORN_RING = clientItem({ id: WORN_RING_ID, name: "Plain Band", quality: "uncommon", stats: { stamina: 9, intellect: 8 } });
const SAME_RING = clientItem({ id: BAND_ID, name: "Twin Ring", stats: { stamina: 12, intellect: 5 } });

function worn(slot: string, id: number, name: string): CharacterItem {
  return {
    slot,
    item_id: id,
    name,
    quality: "uncommon",
    item_level: 30,
    inventory_type: "FINGER",
    inventory_type_name: "Finger",
    subclass_name: null,
    binding: null,
    armor: null,
    weapon: null,
    stats: [],
    enchantments: [],
    spells: [],
    set_name: null,
    requirements: [],
    durability: null,
    durability_low: false,
    description: null,
  };
}

const CHARACTER = {
  slug: "jason-kwon",
  name: "Jason",
  surname: "Kwon",
  items: [worn("FINGER_1", WORN_RING_ID, "Plain Band"), worn("FINGER_2", BAND_ID, "Twin Ring")],
} as CharacterResponse;

function saveCharacter(): void {
  window.localStorage.setItem(
    PLAYER_SETTINGS_STORAGE_KEY,
    JSON.stringify({ faction: "A", classId: "warlock", zoneId: null, level: 37, position: null, characterSlug: "jason-kwon" }),
  );
}

function renderName() {
  return render(
    <MemoryRouter>
      <AuctionItemName itemId={RING_ID} label="Ring of the Eagle" />
      <p data-testid="elsewhere">elsewhere</p>
    </MemoryRouter>,
  );
}

function hover(): void {
  fireEvent.pointerEnter(screen.getByRole("button", { name: "Ring of the Eagle" }), { pointerType: "mouse" });
  act(() => {
    vi.advanceTimersByTime(ITEM_TOOLTIP_SHOW_DELAY_MS);
  });
}

describe("Auction house item tooltip", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useFakeTimers();
    tooltipData.mockReturnValue({
      status: ITEM_TOOLTIP_STATUS.READY,
      data: { item: HOVERED, facts: { bind: null, buyPrice: null, crafted: [] } },
    });
    clientItems.mockReturnValue({
      status: LOAD_STATUS.ready,
      list: { byId: new Map([WORN_RING, SAME_RING].map((i) => [i.id, i])) },
    });
    characterQuery.mockReturnValue({ data: CHARACTER, isError: false });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("shows nothing until the name is hovered, then the stats beside what is worn, with deltas", () => {
    saveCharacter();
    renderName();
    expect(screen.queryByTestId("item-compare-tooltip")).not.toBeInTheDocument();
    expect(characterQuery).not.toHaveBeenCalled();

    hover();
    const tooltip = screen.getByTestId("item-compare-tooltip");
    expect(within(tooltip).getByTestId("item-stats")).toHaveTextContent("Ring of the Eagle");
    expect(within(tooltip).getByText("Compared with Jason Kwon's gear")).toBeInTheDocument();
    const [plain, twin] = within(tooltip).getAllByTestId("item-compare-block");
    expect(within(plain).getByText("Plain Band")).toBeInTheDocument();
    expect(within(plain).getByText("+3 Stamina")).toHaveAttribute("data-gain", "true");
    expect(within(plain).getByText("−3 Intellect")).toHaveAttribute("data-gain", "false");
    expect(within(twin).getByText("No stat changes")).toBeInTheDocument();
    expect(characterQuery).toHaveBeenCalledWith("jason-kwon");
  });

  it("with no saved character still shows the stats and one line on how to compare, linking to the lookup", () => {
    renderName();
    hover();
    const tooltip = screen.getByTestId("item-compare-tooltip");
    expect(within(tooltip).getByTestId("item-stats")).toBeInTheDocument();
    const note = within(tooltip).getByTestId("item-compare-no-character");
    expect(note).toHaveTextContent("Compare with your gear: look up your character and press Use for MGA's pages.");
    expect(within(note).getByText("Look up your character").closest("a")).toHaveAttribute("href", "/wow-forever/character");
    expect(characterQuery).not.toHaveBeenCalled();
    expect(clientItems).not.toHaveBeenCalled();
  });

  it("says so, without crashing, when the character can't be loaded", () => {
    saveCharacter();
    characterQuery.mockReturnValue({ data: undefined, isError: true });
    renderName();
    hover();
    const tooltip = screen.getByTestId("item-compare-tooltip");
    expect(within(tooltip).getByTestId("item-stats")).toBeInTheDocument();
    expect(tooltip).toHaveTextContent("Couldn't load your character's gear");
  });

  it("shows a skeleton while the character loads", () => {
    saveCharacter();
    characterQuery.mockReturnValue({ data: undefined, isError: false });
    renderName();
    hover();
    expect(screen.getByTestId("item-compare-skeleton")).toBeInTheDocument();
  });

  it("says nothing is equipped when the slot is empty", () => {
    saveCharacter();
    characterQuery.mockReturnValue({ data: { ...CHARACTER, items: [] }, isError: false });
    renderName();
    hover();
    expect(screen.getByTestId("item-compare-tooltip")).toHaveTextContent("Nothing equipped in this slot yet.");
  });

  it("adds no compare section for an item that isn't worn", () => {
    saveCharacter();
    tooltipData.mockReturnValue({
      status: ITEM_TOOLTIP_STATUS.READY,
      data: { item: clientItem({ slot: "other", stats: {} }), facts: { bind: null, buyPrice: null, crafted: [] } },
    });
    renderName();
    hover();
    expect(screen.getByTestId("item-stats")).toBeInTheDocument();
    expect(screen.queryByTestId("item-compare-no-character")).not.toBeInTheDocument();
    expect(characterQuery).not.toHaveBeenCalled();
  });

  it("opens on a tap and closes on a tap elsewhere, but not on a touch inside the tooltip", () => {
    saveCharacter();
    renderName();
    const name = screen.getByRole("button", { name: "Ring of the Eagle" });
    fireEvent.pointerDown(name, { pointerType: "touch" });
    fireEvent.click(name);
    expect(name).toHaveAttribute("aria-expanded", "true");
    const tooltip = screen.getByTestId("item-compare-tooltip");

    fireEvent.pointerDown(tooltip, { pointerType: "touch" });
    expect(screen.getByTestId("item-compare-tooltip")).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByTestId("elsewhere"), { pointerType: "touch" });
    expect(screen.queryByTestId("item-compare-tooltip")).not.toBeInTheDocument();
  });

  it("a second tap on the name closes it", () => {
    renderName();
    const name = screen.getByRole("button", { name: "Ring of the Eagle" });
    fireEvent.pointerDown(name, { pointerType: "touch" });
    fireEvent.click(name);
    fireEvent.pointerDown(name, { pointerType: "touch" });
    fireEvent.click(name);
    expect(screen.queryByTestId("item-compare-tooltip")).not.toBeInTheDocument();
  });
});

describe("Auction house item tooltip with a mouse", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useFakeTimers();
    tooltipData.mockReturnValue({
      status: ITEM_TOOLTIP_STATUS.READY,
      data: { item: HOVERED, facts: { bind: null, buyPrice: null, crafted: [] } },
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("closes when the pointer leaves, but stays while it moves onto the tooltip", () => {
    renderName();
    hover();
    const name = screen.getByRole("button", { name: "Ring of the Eagle" });
    fireEvent.pointerLeave(name, { pointerType: "mouse" });
    fireEvent.pointerEnter(screen.getByTestId("item-compare-tooltip"), { pointerType: "mouse" });
    act(() => {
      vi.advanceTimersByTime(ITEM_TOOLTIP_HIDE_GRACE_MS * 2);
    });
    expect(screen.getByTestId("item-compare-tooltip")).toBeInTheDocument();

    fireEvent.pointerLeave(screen.getByTestId("item-compare-tooltip"), { pointerType: "mouse" });
    expect(screen.queryByTestId("item-compare-tooltip")).not.toBeInTheDocument();
  });

  it("closes once the grace period passes without the pointer reaching the tooltip", () => {
    renderName();
    hover();
    fireEvent.pointerLeave(screen.getByRole("button", { name: "Ring of the Eagle" }), { pointerType: "mouse" });
    act(() => {
      vi.advanceTimersByTime(ITEM_TOOLTIP_HIDE_GRACE_MS);
    });
    expect(screen.queryByTestId("item-compare-tooltip")).not.toBeInTheDocument();
  });
});
