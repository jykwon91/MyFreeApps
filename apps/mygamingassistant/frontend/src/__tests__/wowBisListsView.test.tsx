import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import BisListsView from "@/games/wow-forever/components/gear/bisLists/BisListsView";
import { BIS_LISTS_STORAGE_KEY } from "@/games/wow-forever/data/bisLists/bisListConfig";
import { decodeGearData } from "@/games/wow-forever/gear/decodeGearData";
import { DEFAULT_GEAR_SETTINGS } from "@/games/wow-forever/hooks/useGearSettings";
import { decodeBisListFragment } from "@/games/wow-forever/lib/bisLists/bisListFragment";
import type { SharedBisList } from "@/games/wow-forever/types/bisLists/sharedBisList";
import type { SharedBisListLink } from "@/games/wow-forever/types/bisLists/sharedBisListLink";
import type { GearDataState } from "@/games/wow-forever/types/gearDataState";
import type { GearSettings } from "@/games/wow-forever/types/gearSettings";
import { FACTION } from "@/games/wow-forever/types/worldMap";
import { fixtureList } from "./wowClientItemsFixture";

const showSuccess = vi.fn();
const showError = vi.fn();
vi.mock("@platform/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@platform/ui")>()),
  showSuccess: (...a: unknown[]) => showSuccess(...a),
  showError: (...a: unknown[]) => showError(...a),
}));

const GEAR = decodeGearData(
  { clientBuild: "1.60.1.70790", eraLeftovers: [], deprecated: [], crafted: {}, requires: {}, reputation: {}, pvp: {}, bindOnPickup: {} },
  { dungeons: {}, raidOnly: [], pvp: [], quests: {}, drops: {} },
);
const READY: GearDataState = { status: "ready", list: fixtureList(), gear: GEAR };
const WARRIOR: GearSettings = { ...DEFAULT_GEAR_SETTINGS, classId: "warrior", specId: "fury", level: 60, view: "mine" };
const NO_LINK: SharedBisListLink = { present: false, list: null, close: vi.fn() };
const onFactionChange = vi.fn();

function renderView(shared: SharedBisListLink = NO_LINK, state: GearDataState = READY, settings: GearSettings = WARRIOR) {
  return render(
    <MemoryRouter>
      <BisListsView settings={settings} state={state} shared={shared} onFactionChange={onFactionChange} />
    </MemoryRouter>,
  );
}

function row(slot: string): HTMLElement {
  const found = screen.getAllByTestId("bis-slot-row").find((el) => el.dataset.slot === slot);
  if (!found) throw new Error(`no ${slot} row`);
  return found;
}

async function createEmpty(name: string) {
  await userEvent.type(screen.getByRole("textbox", { name: "List name" }), name);
  await userEvent.click(screen.getByRole("radio", { name: "Empty" }));
  await userEvent.click(screen.getByRole("button", { name: "Create list" }));
}

async function pick(slot: string, label: string, query: string, option: RegExp) {
  await userEvent.click(within(row(slot)).getByRole("button", { name: `Pick an item for ${label}` }));
  await userEvent.type(within(row(slot)).getByRole("combobox", { name: "Item name" }), query);
  await userEvent.click(await within(row(slot)).findByRole("option", { name: option }));
}

function stored(): { lists: { name: string; items: Record<string, number> }[] } {
  return JSON.parse(window.localStorage.getItem(BIS_LISTS_STORAGE_KEY) ?? "null");
}

describe("My lists", () => {
  beforeEach(() => {
    window.localStorage.clear();
    showSuccess.mockReset();
    showError.mockReset();
  });

  it("shows a skeleton while the item data loads", () => {
    renderView(NO_LINK, { status: "loading" });
    expect(screen.getByTestId("bis-list-skeleton")).toBeInTheDocument();
    expect(screen.getAllByTestId("bis-slot-skeleton")).toHaveLength(18);
  });

  it("creates an empty list, picks an item through the slot-limited search, and saves it", async () => {
    renderView();
    expect(window.localStorage.getItem(BIS_LISTS_STORAGE_KEY)).toBeNull();
    await createEmpty("My fury set");
    expect(screen.getByRole("heading", { name: "My fury set" })).toBeInTheDocument();
    expect(showSuccess).toHaveBeenCalledWith("Created “My fury set”");
    expect(within(row("head")).getByText("Nothing picked yet")).toBeInTheDocument();

    await pick("head", "Head", "helm", /Lionheart Helm/);
    // The mail Crusader Helm fits a warrior too; the cloth robe never shows for the chest row.
    const link = within(row("head")).getByRole("link", { name: "Lionheart Helm" });
    expect(link).toHaveAttribute("href", "/wow-forever/items/12640");
    expect(stored().lists[0]).toMatchObject({ name: "My fury set", items: { head: 12640 } });

    await userEvent.click(within(row("chest")).getByRole("button", { name: "Pick an item for Chest" }));
    await userEvent.type(within(row("chest")).getByRole("combobox", { name: "Item name" }), "robe");
    expect(within(row("chest")).queryByRole("option", { name: /Mageweave Robe/ })).not.toBeInTheDocument();
    expect(within(row("chest")).getByText("Only items a Warrior can wear in Chest.")).toBeInTheDocument();
  });

  it("ticks “I have it”, counts it, and clears a row", async () => {
    renderView();
    await createEmpty("Set");
    await pick("head", "Head", "lion", /Lionheart Helm/);
    expect(screen.getByTestId("bis-list-progress")).toHaveTextContent("0 of 1 obtained");
    await userEvent.click(within(row("head")).getByRole("checkbox", { name: /I have it/ }));
    expect(screen.getByTestId("bis-list-progress")).toHaveTextContent("1 of 1 obtained");
    await userEvent.click(within(row("head")).getByRole("button", { name: "Clear Head" }));
    expect(within(row("head")).getByText("Nothing picked yet")).toBeInTheDocument();
    expect(screen.getByTestId("bis-list-progress")).toHaveTextContent("0 of 0 obtained");
  });

  it("starts from the recommended picks", async () => {
    renderView();
    await userEvent.click(screen.getByRole("button", { name: "Create list" }));
    expect(screen.getByRole("heading", { name: "Fury Warrior Pre-raid" })).toBeInTheDocument();
    expect(within(row("head")).getByRole("link")).toBeInTheDocument();
  });

  it("the faction choice is Best gear's own, shared by the source lines", async () => {
    onFactionChange.mockReset();
    renderView(NO_LINK, READY, { ...WARRIOR, faction: FACTION.alliance });
    const toggle = screen.getByRole("radiogroup", { name: "Quest sources for" });
    expect(within(toggle).getByRole("radio", { name: "Alliance" })).toBeChecked();
    await userEvent.click(within(toggle).getByRole("radio", { name: "Horde" }));
    expect(onFactionChange).toHaveBeenCalledWith(FACTION.horde);
  });

  it("a two-hander clears the hands and says so", async () => {
    renderView(NO_LINK, READY, { ...WARRIOR, classId: "priest", specId: "holy" });
    await createEmpty("Holy");
    await pick("main_hand", "Main hand", "bronze", /Bronze Mace/);
    await pick("two_hand", "Two-hand weapon", "bene", /Benediction/);
    expect(within(row("main_hand")).getByText("Nothing picked yet")).toBeInTheDocument();
    expect(showSuccess).toHaveBeenCalledWith("Put Benediction in Two-hand weapon and cleared Main hand");
  });

  it("renames, duplicates and deletes behind a confirm", async () => {
    renderView();
    await createEmpty("Tank");
    await userEvent.click(screen.getByRole("button", { name: "Rename" }));
    const box = screen.getByRole("textbox", { name: "List name" });
    await userEvent.clear(box);
    await userEvent.type(box, "Prot");
    await userEvent.click(screen.getByRole("button", { name: "Save name" }));
    expect(screen.getByRole("heading", { name: "Prot" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Duplicate" }));
    expect(screen.getByRole("heading", { name: "Copy of Prot" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Your lists" })).toHaveDisplayValue("Copy of Prot");

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Delete “Copy of Prot”?")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete list" }));
    expect(screen.getByRole("heading", { name: "Prot" })).toBeInTheDocument();
    expect(stored().lists.map((l) => l.name)).toEqual(["Prot"]);
  });

  it("picks up lists another tab saved, so its next save keeps them", async () => {
    renderView();
    await createEmpty("Tank");
    const raw = JSON.parse(window.localStorage.getItem(BIS_LISTS_STORAGE_KEY) ?? "{}");
    const other = { ...raw, lists: [...raw.lists, { ...raw.lists[0], id: "other-tab", name: "Healer" }], selectedId: "other-tab" };
    const value = JSON.stringify(other);
    window.localStorage.setItem(BIS_LISTS_STORAGE_KEY, value);
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: BIS_LISTS_STORAGE_KEY, newValue: value }));
    });
    // This tab stays on its list, and reading the other tab's save doesn't write it back.
    expect(screen.getByRole("heading", { name: "Tank" })).toBeInTheDocument();
    expect(window.localStorage.getItem(BIS_LISTS_STORAGE_KEY)).toBe(value);
    expect(screen.getByRole("combobox", { name: "Your lists" })).toHaveTextContent("Healer");

    await pick("head", "Head", "lion", /Lionheart Helm/);
    expect(stored().lists.map((l) => l.name)).toEqual(["Tank", "Healer"]);
    expect(stored().lists[0].items).toEqual({ head: 12640 });
  });

  it("copies a share link carrying the list", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderView();
    await createEmpty("Share me");
    await pick("head", "Head", "lion", /Lionheart Helm/);
    await userEvent.click(screen.getByRole("button", { name: /Copy link/ }));
    const url = String(writeText.mock.calls[0][0]);
    expect(url).toMatch(/\/wow-forever\/gear\?view=mine#list=1~warrior~fury~preraid~head:12640~Share%20me$/);
    expect(showSuccess).toHaveBeenCalledWith("Link to “Share me” copied — anyone with it can see the list");
  });

  it("shows the link to copy by hand when the clipboard is blocked", async () => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn().mockRejectedValue(new Error("no")) }, configurable: true });
    renderView();
    await createEmpty("Blocked");
    await userEvent.click(screen.getByRole("button", { name: /Copy link/ }));
    expect(showError).toHaveBeenCalled();
    expect(screen.getByDisplayValue(/#list=1~warrior/)).toBeInTheDocument();
  });
});

describe("a shared list", () => {
  beforeEach(() => {
    window.localStorage.clear();
    showSuccess.mockReset();
  });

  it("opens read-only, notes left-out items, and saves to my lists", async () => {
    const list = decodeBisListFragment("list=1~warrior~fury~raid~head:12640,chest:9007,neck:999999~Friend%27s%20list") as SharedBisList;
    const close = vi.fn();
    renderView({ present: true, list, close });
    expect(screen.getByRole("heading", { name: "Friend's list" })).toBeInTheDocument();
    expect(screen.getByText(/read-only/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Pick an item/ })).not.toBeInTheDocument();
    expect(screen.getByTestId("bis-shared-dropped")).toHaveTextContent("2 items in the link were left out");
    expect(within(row("head")).getByRole("link", { name: "Lionheart Helm" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Save to my lists" }));
    expect(close).toHaveBeenCalled();
    expect(showSuccess).toHaveBeenCalledWith("Saved “Friend's list” to your lists");
    expect(stored().lists[0]).toMatchObject({ name: "Friend's list", items: { head: 12640 } });
  });

  it("says when a link can't be read", async () => {
    const close = vi.fn();
    renderView({ present: true, list: null, close });
    expect(screen.getByTestId("bis-shared-invalid")).toHaveTextContent("This list link doesn't work");
    await userEvent.click(screen.getByRole("button", { name: "Back to my lists" }));
    expect(close).toHaveBeenCalled();
  });
});
