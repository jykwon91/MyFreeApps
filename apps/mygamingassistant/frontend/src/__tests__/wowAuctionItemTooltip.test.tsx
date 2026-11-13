/**
 * The Auction house item tooltip: hover (mouse) or tap shows the item's stats beside the gear the
 * saved character wears in its slot, with green/red deltas; without a saved character it says how
 * to compare; a failed character load is a short note; a tap outside closes it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  level: 37,
  class_name: "Warlock",
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
      list: { byId: new Map([WORN_RING, SAME_RING].map((i) => [i.id, i])), clientBuild: "1.60.1" },
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

  it("says whether it is better or worse than each worn item, scored with the class's leveling weights below 60", () => {
    saveCharacter();
    renderName();
    hover();
    const tooltip = screen.getByTestId("item-compare-tooltip");
    expect(within(tooltip).getByTestId("item-compare-scored-for")).toHaveTextContent("Scored for Warlock leveling (the spec counts at 60)");
    const [plain, twin] = within(tooltip).getAllByTestId("item-compare-block");
    // Warlock leveling: stamina 1, intellect 0.7 -> 15.5 against the Plain Band's 14.6.
    expect(within(plain).getByTestId("item-compare-verdict")).toHaveAttribute("data-verdict", "upgrade");
    expect(within(plain).getByTestId("item-compare-verdict")).toHaveTextContent("Upgrade +6%");
    expect(within(twin).getByTestId("item-compare-verdict")).toHaveTextContent("About the same");
  });

  it("says a downgrade in words, with the arrow hidden from screen readers", () => {
    saveCharacter();
    tooltipData.mockReturnValue({
      status: ITEM_TOOLTIP_STATUS.READY,
      data: { item: clientItem({ stats: { stamina: 4 } }), facts: { bind: null, buyPrice: null, crafted: [] } },
    });
    renderName();
    hover();
    const [plain] = screen.getAllByTestId("item-compare-verdict");
    expect(plain).toHaveAttribute("data-verdict", "downgrade");
    expect(plain).toHaveTextContent("Downgrade −73%");
    expect(plain.querySelector("[aria-hidden='true']")).toHaveTextContent("▼");
  });

  it("says the character can't use an item their class can't wear, without gains or verdicts", () => {
    saveCharacter();
    tooltipData.mockReturnValue({
      status: ITEM_TOOLTIP_STATUS.READY,
      data: { item: clientItem({ slot: "chest", itemType: "Plate", armor: 500, stats: { stamina: 30 } }), facts: { bind: null, buyPrice: null, crafted: [] } },
    });
    characterQuery.mockReturnValue({ data: { ...CHARACTER, items: [{ ...worn("CHEST", WORN_RING_ID, "Robe"), inventory_type: "CHEST" }] }, isError: false });
    renderName();
    hover();
    const tooltip = screen.getByTestId("item-compare-tooltip");
    expect(within(tooltip).getByTestId("item-compare-cant-use")).toHaveTextContent("Your level 37 Warlock can't use this (Plate).");
    expect(within(tooltip).queryByTestId("item-compare-verdict")).not.toBeInTheDocument();
    expect(within(tooltip).queryByTestId("item-compare-block")).not.toBeInTheDocument();
  });

  it("gives no verdict for a class MGA doesn't know, but still shows the deltas", () => {
    saveCharacter();
    characterQuery.mockReturnValue({ data: { ...CHARACTER, class_name: "Unknown" }, isError: false });
    renderName();
    hover();
    const tooltip = screen.getByTestId("item-compare-tooltip");
    expect(within(tooltip).queryByTestId("item-compare-verdict")).not.toBeInTheDocument();
    expect(within(tooltip).queryByTestId("item-compare-scored-for")).not.toBeInTheDocument();
    expect(within(tooltip).getByText("+3 Stamina")).toBeInTheDocument();
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

  it("is a labelled non-modal dialog the name controls, not a tooltip", () => {
    saveCharacter();
    renderName();
    hover();
    const dialog = screen.getByRole("dialog", { hidden: true });
    expect(dialog).toHaveAttribute("aria-label");
    const name = screen.getByRole("button", { name: "Ring of the Eagle" });
    expect(name).toHaveAttribute("aria-controls", dialog.id);
    expect(name).toHaveAttribute("aria-haspopup", "dialog");
    expect(name).not.toHaveAttribute("aria-describedby");
  });

  it("never says no changes when an item has effects the game files only count", () => {
    saveCharacter();
    clientItems.mockReturnValue({
      status: LOAD_STATUS.ready,
      list: { byId: new Map([[WORN_RING_ID, { ...SAME_RING, id: WORN_RING_ID, otherEffects: 1 }]]) },
    });
    characterQuery.mockReturnValue({ data: { ...CHARACTER, items: [CHARACTER.items[0]] }, isError: false });
    renderName();
    hover();
    const block = screen.getByTestId("item-compare-block");
    expect(block).not.toHaveTextContent("No stat changes");
    expect(block).toHaveTextContent("Other effects (procs, on-use, Equip:) aren't compared");
  });

  it("says damage is not compared for a weapon whose damage is unknown", () => {
    saveCharacter();
    const staff = clientItem({ slot: "main_hand", stats: {}, damageUnknown: true });
    tooltipData.mockReturnValue({ status: ITEM_TOOLTIP_STATUS.READY, data: { item: staff, facts: { bind: null, buyPrice: null, crafted: [] } } });
    clientItems.mockReturnValue({
      status: LOAD_STATUS.ready,
      list: { byId: new Map([[WORN_RING_ID, clientItem({ id: WORN_RING_ID, slot: "main_hand", stats: {} })]]) },
    });
    characterQuery.mockReturnValue({ data: { ...CHARACTER, items: [worn("MAIN_HAND", WORN_RING_ID, "Old Staff")] }, isError: false });
    renderName();
    hover();
    const block = screen.getByTestId("item-compare-block");
    expect(block).toHaveTextContent("Damage not compared");
    expect(block).not.toHaveTextContent("No stat changes");
  });

  it("notes that enchants are not counted only when a compared worn item has some", () => {
    saveCharacter();
    renderName();
    hover();
    expect(screen.queryByText("Enchants on your gear aren't counted")).not.toBeInTheDocument();
    cleanup();

    const enchanted = { ...CHARACTER.items[0], enchantments: ["Enchant Ring - Test"] };
    characterQuery.mockReturnValue({ data: { ...CHARACTER, items: [enchanted] }, isError: false });
    renderName();
    hover();
    expect(screen.getByText("Enchants on your gear aren't counted")).toBeInTheDocument();
  });

  it("labels the two-hander an off-hand item would replace", () => {
    saveCharacter();
    const shield = clientItem({ slot: "off_hand", armor: 90, stats: { stamina: 4 } });
    tooltipData.mockReturnValue({ status: ITEM_TOOLTIP_STATUS.READY, data: { item: shield, facts: { bind: null, buyPrice: null, crafted: [] } } });
    clientItems.mockReturnValue({
      status: LOAD_STATUS.ready,
      list: { byId: new Map([[WORN_RING_ID, clientItem({ id: WORN_RING_ID, slot: "two_hand", stats: { stamina: 9 } })]]) },
    });
    const staff = { ...worn("MAIN_HAND", WORN_RING_ID, "Big Staff"), inventory_type: "TWOHWEAPON" };
    characterQuery.mockReturnValue({ data: { ...CHARACTER, items: [staff] }, isError: false });
    renderName();
    hover();
    const block = screen.getByTestId("item-compare-block");
    expect(block).toHaveTextContent("Replaces your two-hander");
    expect(block).toHaveTextContent("Big Staff");
    expect(screen.getByTestId("item-compare-tooltip")).not.toHaveTextContent("Nothing equipped");
  });

  it("shows one note, not a crash, when the character and the item list both fail to load", () => {
    saveCharacter();
    characterQuery.mockReturnValue({ data: undefined, isError: true });
    clientItems.mockReturnValue({ status: LOAD_STATUS.error, retry: vi.fn(), retrying: false });
    renderName();
    hover();
    const tooltip = screen.getByTestId("item-compare-tooltip");
    expect(within(tooltip).getByTestId("item-stats")).toBeInTheDocument();
    expect(tooltip).toHaveTextContent("Couldn't load your character's gear");
    expect(tooltip).not.toHaveTextContent("Couldn't load the item list");
  });

  it("opens from the keyboard with Enter, focuses the dialog, and Escape returns focus to the name", async () => {
    vi.useRealTimers();
    saveCharacter();
    renderName();
    const user = userEvent.setup();
    await user.tab();
    const name = screen.getByRole("button", { name: "Ring of the Eagle" });
    expect(name).toHaveFocus();
    expect(screen.queryByTestId("item-compare-tooltip")).not.toBeInTheDocument();
    await user.keyboard("{Enter}");
    const dialog = await screen.findByTestId("item-compare-tooltip");
    await vi.waitFor(() => expect(dialog).toHaveFocus());
    await user.keyboard("{Escape}");
    expect(screen.queryByTestId("item-compare-tooltip")).not.toBeInTheDocument();
    expect(name).toHaveFocus();
  });

  it("lets Tab reach the lookup link when there is no saved character", async () => {
    vi.useRealTimers();
    renderName();
    const user = userEvent.setup();
    await user.tab();
    await user.keyboard("{Enter}");
    const dialog = await screen.findByTestId("item-compare-tooltip");
    await vi.waitFor(() => expect(dialog).toHaveFocus());
    await user.tab();
    expect(within(dialog).getByText("Look up your character").closest("a")).toHaveFocus();
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
    expect(screen.getByTestId("item-compare-tooltip")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(ITEM_TOOLTIP_HIDE_GRACE_MS);
    });
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
