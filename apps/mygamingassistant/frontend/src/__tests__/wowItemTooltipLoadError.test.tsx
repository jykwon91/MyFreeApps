import { describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ItemNameLink from "@/games/wow-forever/components/itemPages/ItemNameLink";

// Hand of Justice (11815) lives in shard 39: the first load fails, the next succeeds.
vi.mock("@/games/wow-forever/data/itemPages/itemPageShards", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/games/wow-forever/data/itemPages/itemPageShards")>();
  const key = Object.keys(actual.FOREVER_ITEM_SHARDS).find((k) => k.endsWith("/39.json")) as string;
  const real = actual.FOREVER_ITEM_SHARDS[key];
  let calls = 0;
  return {
    ...actual,
    FOREVER_ITEM_SHARDS: { [key]: () => (++calls === 1 ? Promise.reject(new Error("offline")) : real()) },
  };
});

describe("item name tooltip when the shard fails to load", () => {
  it("says it couldn't load, and the next open tries again", async () => {
    // Keyboard focus: jsdom has no focus-visible heuristic (see wowItemTooltip.test.tsx).
    const original = Element.prototype.matches;
    vi.spyOn(Element.prototype, "matches").mockImplementation(function (this: Element, selector: string) {
      return selector === ":focus-visible" || original.call(this, selector);
    });
    render(
      <MemoryRouter>
        <ItemNameLink itemId={11815} name="Hand of Justice" />
      </MemoryRouter>,
    );
    const link = screen.getByRole("link", { name: "Hand of Justice" });

    act(() => link.focus());
    expect(await within(await screen.findByRole("tooltip")).findByText(/Couldn't load this item's stats/)).toBeInTheDocument();

    act(() => link.blur());
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    act(() => link.focus());
    const stats = await within(await screen.findByRole("tooltip")).findByTestId("item-stats");
    expect(within(stats).getByText("Binds when picked up")).toBeInTheDocument();
    vi.restoreAllMocks();
  });
});
