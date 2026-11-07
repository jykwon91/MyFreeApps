import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import ItemNameLink from "@/games/wow-forever/components/itemPages/ItemNameLink";
import { ITEM_TOOLTIP_SHOW_DELAY_MS } from "@/games/wow-forever/data/itemPages/itemTooltipConfig";
import type { ClientItem } from "@/games/wow-forever/types/clientItem";

// As the gear page holds it in memory (the row from the Forever shard).
const FELCLOTH_PANTS: ClientItem = {
  id: 14107,
  name: "Felcloth Pants",
  quality: "uncommon",
  slot: "legs",
  itemType: "Cloth",
  itemLevel: 55,
  requiredLevel: 50,
  armor: 62,
  weapon: null,
  stats: { intellect: 12, shadow_spell_damage: 26 },
  classes: null,
  damageUnknown: false,
  otherEffects: 0,
  randomSuffix: false,
};

function renderLink(props: { itemId: number; name: string; item?: ClientItem }) {
  return render(
    <MemoryRouter>
      <ItemNameLink {...props} />
    </MemoryRouter>,
  );
}

/** jsdom has no focus-visible heuristic, so play the browser: keyboard focus matches it, a click or tap doesn't. */
function stubFocusVisible(matches: boolean) {
  const original = Element.prototype.matches;
  vi.spyOn(Element.prototype, "matches").mockImplementation(function (this: Element, selector: string) {
    return selector === ":focus-visible" ? matches : original.call(this, selector);
  });
}

function hover(link: HTMLElement, pointerType: string) {
  fireEvent.pointerEnter(link, { pointerType });
}

describe("item name tooltip", () => {
  beforeEach(() => stubFocusVisible(true));
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("a focus that isn't keyboard focus (a click or a tap) doesn't open it", async () => {
    vi.restoreAllMocks();
    stubFocusVisible(false);
    renderLink({ itemId: FELCLOTH_PANTS.id, name: FELCLOTH_PANTS.name, item: FELCLOTH_PANTS });
    act(() => screen.getByRole("link", { name: "Felcloth Pants" }).focus());
    await act(() => Promise.resolve());
    expect(screen.queryByRole("tooltip", { hidden: true })).not.toBeInTheDocument();
  });

  it("a mouse hover shows the tooltip after the delay, described by the link; leaving hides it", async () => {
    vi.useFakeTimers();
    renderLink({ itemId: FELCLOTH_PANTS.id, name: FELCLOTH_PANTS.name, item: FELCLOTH_PANTS });
    const link = screen.getByRole("link", { name: "Felcloth Pants" });

    hover(link, "mouse");
    act(() => vi.advanceTimersByTime(ITEM_TOOLTIP_SHOW_DELAY_MS - 1));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    // The tooltip stays hidden until Floating UI has placed it (async).
    await act(() => vi.advanceTimersByTimeAsync(1));

    const tooltip = screen.getByRole("tooltip");
    expect(link).toHaveAttribute("aria-describedby", tooltip.id);
    // In-memory stats show at once, in the game's order; the bind line's place is kept while the shard loads.
    expect(within(tooltip).getByTestId("item-stats-bind-loading")).toBeInTheDocument();
    const lines = within(tooltip).getAllByText(/./, { selector: "p" }).map((p) => p.textContent);
    expect(lines.indexOf("Requires Level 50")).toBeLessThan(lines.findIndex((l) => l?.startsWith("Equip:")));
    expect(within(tooltip).queryByText(/Vendor price/)).not.toBeInTheDocument();

    fireEvent.pointerLeave(link, { pointerType: "mouse" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(link).not.toHaveAttribute("aria-describedby");
  });

  it("leaving before the delay never shows it", () => {
    vi.useFakeTimers();
    renderLink({ itemId: FELCLOTH_PANTS.id, name: FELCLOTH_PANTS.name, item: FELCLOTH_PANTS });
    const link = screen.getByRole("link", { name: "Felcloth Pants" });
    hover(link, "mouse");
    fireEvent.pointerLeave(link, { pointerType: "mouse" });
    act(() => vi.advanceTimersByTime(ITEM_TOOLTIP_SHOW_DELAY_MS * 2));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("touch never opens it, so a tap only navigates", () => {
    vi.useFakeTimers();
    renderLink({ itemId: FELCLOTH_PANTS.id, name: FELCLOTH_PANTS.name, item: FELCLOTH_PANTS });
    hover(screen.getByRole("link", { name: "Felcloth Pants" }), "touch");
    act(() => vi.advanceTimersByTime(ITEM_TOOLTIP_SHOW_DELAY_MS * 2));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("keyboard focus shows it at once and Escape hides it", async () => {
    const user = userEvent.setup();
    renderLink({ itemId: FELCLOTH_PANTS.id, name: FELCLOTH_PANTS.name, item: FELCLOTH_PANTS });
    await user.tab();
    expect(screen.getByRole("link", { name: "Felcloth Pants" })).toHaveFocus();
    expect(await screen.findByRole("tooltip")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("fills in the bind line from the item's shard", async () => {
    const user = userEvent.setup();
    renderLink({ itemId: FELCLOTH_PANTS.id, name: FELCLOTH_PANTS.name, item: FELCLOTH_PANTS });
    await user.tab();
    expect(await within(await screen.findByRole("tooltip")).findByText("Binds when equipped")).toBeInTheDocument();
  });

  it("with no item in memory, shows a skeleton then the stats from the shard; a second open is instant", async () => {
    const user = userEvent.setup();
    renderLink({ itemId: 11815, name: "Hand of Justice" });
    act(() => screen.getByRole("link", { name: "Hand of Justice" }).focus());
    expect(screen.getByTestId("item-tooltip-skeleton")).toBeInTheDocument();
    const stats = await within(await screen.findByRole("tooltip")).findByTestId("item-stats");
    expect(within(stats).getByText("Binds when picked up")).toBeInTheDocument();
    expect(within(stats).getByText("Item Level 58")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await user.tab({ shift: true });
    await user.tab();
    expect(within(await screen.findByRole("tooltip")).getByTestId("item-stats")).toBeInTheDocument();
  });

  it("an id in no Forever shard says so", async () => {
    const user = userEvent.setup();
    renderLink({ itemId: 999_999_9, name: "Nothing" });
    await user.tab();
    expect(await within(await screen.findByRole("tooltip")).findByText(/No stats for this item/)).toBeInTheDocument();
  });
});
