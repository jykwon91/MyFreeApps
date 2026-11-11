import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import WowComparePage from "@/games/wow-forever/pages/WowComparePage";
import { COMPARE_SETTINGS_STORAGE_KEY } from "@/games/wow-forever/hooks/useCompareSettings";
import { loadClientItems } from "@/games/wow-forever/lib/clientItemsLoader";
import type { ClientItemList } from "@/games/wow-forever/types/clientItemList";
import { fixtureList } from "./wowClientItemsFixture";
import { iconSources } from "./wowIconFiles";

vi.mock("@/games/wow-forever/api/wowItemsApi", () => ({
  useExtractItemMutation: () => [vi.fn(), { isLoading: false }],
}));
vi.mock("@/games/wow-forever/lib/clientItemsLoader", () => ({
  loadClientItems: vi.fn(),
  prefetchClientItems: vi.fn(),
}));

const loadMock = vi.mocked(loadClientItems);

function card(position: number): HTMLElement {
  return screen.getByRole("article", { name: new RegExp(`^Item ${position}:`) });
}

function renderPage() {
  render(
    <MemoryRouter>
      <WowComparePage />
    </MemoryRouter>,
  );
}

async function pasteInto(position: number, text: string) {
  await userEvent.click(within(card(position)).getByRole("radio", { name: "Paste text" }));
  await userEvent.click(within(card(position)).getByRole("textbox", { name: /tooltip text/i }));
  await userEvent.paste(text);
  await userEvent.click(within(card(position)).getByRole("button", { name: "Read text" }));
}

async function searchAndPick(position: number, query: string, optionName: RegExp) {
  const box = within(card(position)).getByRole("combobox", { name: "Item name" });
  await userEvent.clear(box);
  await userEvent.type(box, query);
  await userEvent.click(await within(card(position)).findByRole("option", { name: optionName }));
}

describe("WoW Forever Item Compare page", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem(
      COMPARE_SETTINGS_STORAGE_KEY,
      JSON.stringify({ classId: "warrior", specId: "arms", bracket: "level60", currentHitPct: null }),
    );
    loadMock.mockReset();
    loadMock.mockResolvedValue(fixtureList());
  });

  it("opens each item on searching by name, with screenshot and text as alternatives", async () => {
    renderPage();
    const first = card(1);
    expect(within(first).getByRole("radio", { name: "Search by name" })).toHaveAttribute("aria-checked", "true");
    expect(within(first).getByRole("radio", { name: "From a screenshot" })).toHaveAttribute("aria-checked", "false");
    expect(within(first).getByRole("radio", { name: "Paste text" })).toHaveAttribute("aria-checked", "false");
    expect(await within(first).findByText(/like “Lionheart Helm” or “Dark Iron Plate”/)).toBeInTheDocument();
    expect(screen.getByText(/Item data from the WoW Forever client via wago\.tools/)).toHaveTextContent(
      "Client build 1.60.1.70790",
    );
  });

  it("asks for two letters before searching", async () => {
    renderPage();
    await userEvent.type(within(card(1)).getByRole("combobox", { name: "Item name" }), "l");
    expect(await within(card(1)).findByText("Type at least 2 letters of the item's name.")).toBeInTheDocument();
  });

  it("picks from the game files, marks edits, and resets them", async () => {
    renderPage();
    await searchAndPick(1, "lionheart", /Lionheart Helm/);
    const first = card(1);
    expect(within(first).getByRole("button", { name: "Change item" })).toHaveFocus();
    expect(within(first).getByText("From the Forever game files")).toBeInTheDocument();
    expect(within(first).getByText(/The game may have changed this item/)).toBeInTheDocument();
    expect(within(first).getByRole("spinbutton", { name: "Armor" })).toHaveValue(565);

    const armor = within(first).getByRole("spinbutton", { name: "Armor" });
    await userEvent.clear(armor);
    await userEvent.type(armor, "600");
    expect(within(first).getByText("From the Forever game files, edited by you")).toBeInTheDocument();
    expect(within(first).getByText(/game files say 565 armor/)).toBeInTheDocument();

    await userEvent.click(within(first).getByRole("button", { name: "Reset to game-file values" }));
    expect(within(first).getByRole("spinbutton", { name: "Armor" })).toHaveValue(565);
    expect(within(first).getByText("From the Forever game files")).toBeInTheDocument();
  });

  it("keeps edits when the same item is picked again, and keeps the query on Change item", async () => {
    renderPage();
    await searchAndPick(1, "lionheart", /Lionheart Helm/);
    const armor = within(card(1)).getByRole("spinbutton", { name: "Armor" });
    await userEvent.clear(armor);
    await userEvent.type(armor, "600");
    await userEvent.click(within(card(1)).getByRole("button", { name: "Change item" }));
    expect(within(card(1)).getByRole("combobox", { name: "Item name" })).toHaveValue("lionheart");
    await userEvent.click(await within(card(1)).findByRole("option", { name: /Lionheart Helm/ }));
    expect(within(card(1)).getByRole("spinbutton", { name: "Armor" })).toHaveValue(600);
  });

  it("says when two cards hold the same item", async () => {
    renderPage();
    await searchAndPick(1, "lionheart", /Lionheart Helm/);
    await searchAndPick(2, "lion helm", /Lionheart Helm/);
    expect(within(card(2)).getByText(/Same as item 1/)).toBeInTheDocument();
  });

  it("hides items the class can't use, and says how many", async () => {
    renderPage();
    await userEvent.type(within(card(1)).getByRole("combobox", { name: "Item name" }), "benediction");
    expect(await within(card(1)).findByText(/1 hidden because Warrior can't use them/)).toBeInTheDocument();
    await userEvent.click(within(card(1)).getByRole("button", { name: "Show them" }));
    expect(await within(card(1)).findByRole("option", { name: /Benediction/ })).toBeInTheDocument();
  });

  it("offers closest matches for a misspelling", async () => {
    renderPage();
    await userEvent.type(within(card(1)).getByRole("combobox", { name: "Item name" }), "lionhart");
    expect(await within(card(1)).findByText("Closest matches: 1 item")).toBeInTheDocument();
  });

  it("picks with the keyboard", async () => {
    renderPage();
    const box = within(card(1)).getByRole("combobox", { name: "Item name" });
    await userEvent.type(box, "dark iron");
    await within(card(1)).findByRole("option", { name: /Dark Iron Plate/ });
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(within(card(1)).getByRole("spinbutton", { name: "Armor" })).toHaveValue(817);
    expect(screen.getByText("Selected Dark Iron Plate")).toBeInTheDocument();
  });

  it("falls back to entering an item by hand", async () => {
    renderPage();
    await userEvent.type(within(card(1)).getByRole("combobox", { name: "Item name" }), "zzzz qqqq");
    expect(await within(card(1)).findByText(/No items match/)).toBeInTheDocument();
    await userEvent.click(within(card(1)).getByRole("button", { name: "Can't find it? Enter it by hand" }));
    expect(within(card(1)).getByRole("textbox", { name: "Name of item 1" })).toHaveValue("zzzz qqqq");
    expect(within(card(1)).getByRole("combobox", { name: "Slot" })).toHaveFocus();
  });

  it("shows a skeleton while the list loads, and a retry when it fails", async () => {
    // Both cards share one load, as the real loader's module-level promise does.
    let fail: (error: Error) => void = () => undefined;
    const firstLoad = new Promise<ClientItemList>((_, reject) => (fail = reject));
    loadMock.mockReturnValueOnce(firstLoad).mockReturnValueOnce(firstLoad);
    renderPage();
    expect(screen.getAllByTestId("item-search-skeleton").length).toBeGreaterThan(0);
    expect(within(card(1)).getByText("Loading item list…")).toBeInTheDocument();
    // The box works while the list loads; what's typed is searched once it arrives.
    expect(within(card(1)).getByRole("combobox", { name: "Item name" })).toBeEnabled();
    fail(new Error("offline"));
    expect(
      (await screen.findAllByText("Couldn't load the item list. Check your connection and try again.")).length,
    ).toBeGreaterThan(0);
    await userEvent.click(within(card(1)).getByRole("button", { name: "Try again" }));
    expect(await within(card(1)).findByText(/like “Lionheart Helm”/)).toBeInTheDocument();
  });

  it("still compares two pasted items and explains the winner", async () => {
    renderPage();
    expect(screen.getByText(/add stats to at least two items/i)).toBeInTheDocument();
    expect(screen.getByText(/stat values aren't published yet/i)).toBeInTheDocument();

    await pasteInto(1, "Strong Helm\n+20 Strength\n+5 Intellect");
    await pasteInto(2, "Sturdy Helm\n+5 Strength\n+10 Stamina");

    expect(screen.getByRole("heading", { name: "Strong Helm is the better pick" })).toBeInTheDocument();
    expect(screen.getByText(/ahead mostly on Strength/)).toBeInTheDocument();
    expect(screen.getAllByText(/not scored/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Pawn Classic Era scale — Arms Warrior/)).toBeInTheDocument();
  }, 20_000);
});

describe("Item Compare icons", () => {
  beforeEach(() => {
    window.localStorage.clear();
    loadMock.mockReset();
    loadMock.mockResolvedValue(fixtureList());
  });

  it("shows the picked item's icon on its card and in the search results", async () => {
    renderPage();
    const box = within(card(1)).getByRole("combobox", { name: "Item name" });
    await userEvent.type(box, "lionheart");
    const option = await within(card(1)).findByRole("option", { name: /Lionheart Helm/ });
    expect(within(option).getByTestId("game-icon")).toBeInTheDocument();
    await userEvent.click(option);
    expect(iconSources(card(1)).length).toBeGreaterThan(0);
  });
});
