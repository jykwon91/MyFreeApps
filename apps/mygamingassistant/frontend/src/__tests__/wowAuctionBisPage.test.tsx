import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { decodeGearData } from "@/games/wow-forever/gear/decodeGearData";
import { PLAYER_SETTINGS_STORAGE_KEY } from "@/games/wow-forever/hooks/usePlayerSettings";
import WowAuctionHousePage from "@/games/wow-forever/pages/WowAuctionHousePage";
import type { ClientItem } from "@/games/wow-forever/types/clientItem";
import type { ClientItemList } from "@/games/wow-forever/types/clientItemList";
import type { GearData } from "@/games/wow-forever/types/gearData";
import type { PriceListResponse } from "@/games/wow-forever/types/priceListResponse";
import { PRICE_COLUMNS, pricesReady } from "@/test/auctionPricesStub";

const usePricesQuery = vi.hoisted(() => vi.fn());
vi.mock("@/games/wow-forever/api/wowPricesApi", () => ({ useGetWowPricesQuery: usePricesQuery }));

const loadClientItems = vi.hoisted(() => vi.fn());
vi.mock("@/games/wow-forever/lib/clientItemsLoader", () => ({ loadClientItems }));

const loadGearData = vi.hoisted(() => vi.fn());
vi.mock("@/games/wow-forever/gear/gearDataLoader", () => ({ loadGearData }));

function neck(id: number, requiredLevel = 0): ClientItem {
  return {
    id,
    name: `Neck ${id}`,
    quality: "rare",
    slot: "neck",
    itemType: null,
    itemLevel: 60,
    requiredLevel,
    armor: null,
    weapon: null,
    stats: { spell_damage: id },
    classes: null,
    damageUnknown: false,
    otherEffects: 0,
    randomSuffix: false,
  };
}

// Neck 40, 30, 20 are the top three at level 60, then 15 and 10. Only Neck 15 can be worn at level 20 (the rest are estimated at 55).
const GEAR_ITEMS = [neck(40), neck(30), neck(20), neck(10), neck(15, 15)];
const LIST = { items: GEAR_ITEMS, byId: new Map(GEAR_ITEMS.map((i) => [i.id, i])) } as unknown as ClientItemList;
const GEAR_DATA: GearData = decodeGearData(
  { clientBuild: "x", eraLeftovers: [], deprecated: [], crafted: {}, requires: {}, reputation: {}, pvp: {}, bindOnPickup: {} },
  { dungeons: {}, raidOnly: [], pvp: [], quests: {}, drops: {} },
);

// [item_id, market_value, min_buyout, quantity, listings, name]
const ITEMS: PriceListResponse["items"] = [
  [40, 900, 800, 3, 2, "Neck 40"],
  [30, 700, 600, 3, 2, "Neck 30"],
  [20, 500, 400, 3, 2, "Neck 20"],
  [10, 300, 200, 3, 2, "Neck 10"],
  [15, 250, 200, 3, 2, "Neck 15"],
  [2589, 120, 100, 23980, 910, "Linen Cloth"],
];

function Where() {
  const { search } = useLocation();
  return <span data-testid="search">{search}</span>;
}

function renderPage(path = "/wow-forever/auction-house") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <WowAuctionHousePage />
      <Where />
    </MemoryRouter>,
  );
}

const names = () => screen.queryAllByTestId("auction-item-name").map((n) => n.textContent);
const badges = () => screen.queryAllByTestId("auction-bis-badge").map((n) => n.textContent);
const url = () => screen.getByTestId("search").textContent ?? "";

beforeEach(() => {
  window.localStorage.clear();
  usePricesQuery.mockReset();
  loadClientItems.mockReset().mockResolvedValue(LIST);
  loadGearData.mockReset().mockResolvedValue(GEAR_DATA);
  const data: PriceListResponse = {
    region: "us",
    server: "pvp",
    faction: "alliance",
    source_updated_at: new Date(Date.now() - 3_600_000).toISOString(),
    fetched_at: null,
    columns: PRICE_COLUMNS,
    items: ITEMS,
  };
  usePricesQuery.mockReturnValue(pricesReady(data));
});

describe("Auction house top picks filter", () => {
  it("is off by default and loads no gear data", async () => {
    renderPage();
    expect(names()).toHaveLength(ITEMS.length);
    expect(loadGearData).not.toHaveBeenCalled();
    expect(badges()).toEqual([]);
  });

  it("keeps the three best items for the player's class, tags each with its rank and slot, and says it's BiS at level 60", async () => {
    renderPage("/wow-forever/auction-house?bis=any");
    await waitFor(() => expect(names()).toEqual(["Neck 20", "Neck 30", "Neck 40"]));
    expect(badges()).toEqual(["#3 Neck", "#2 Neck", "#1 Neck"]);
    expect(within(screen.getByTestId("auction-active-filters")).getByRole("button", { name: "Remove filter: Top 3 BiS for level 60 Affliction Warlock" })).toBeInTheDocument();
  });

  it("shows the list skeleton, never the unfiltered list, until the gear data is in", async () => {
    let finish: (data: GearData) => void = () => undefined;
    loadGearData.mockReturnValue(new Promise<GearData>((resolve) => (finish = resolve)));
    renderPage("/wow-forever/auction-house?bis=any");
    expect(screen.getByTestId("auction-skeleton")).toBeInTheDocument();
    expect(names()).toEqual([]);
    await act(async () => finish(GEAR_DATA));
    await waitFor(() => expect(names()).toEqual(["Neck 20", "Neck 30", "Neck 40"]));
  });

  it("shows a retry when the gear data fails to load", async () => {
    loadGearData.mockRejectedValueOnce(new Error("offline")).mockResolvedValue(GEAR_DATA);
    renderPage("/wow-forever/auction-house?bis=1");
    expect(await screen.findByText("Couldn't load the gear list.")).toBeInTheDocument();
    expect(names()).toEqual([]);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(names()).toEqual(["Neck 40"]));
  });

  it("restricts to one rank from a chip, and Off clears it", async () => {
    renderPage();
    await userEvent.click(screen.getByTestId("auction-filters-button"));
    const sheet = await screen.findByRole("dialog", { name: "Filters" });
    await userEvent.click(within(sheet).getByRole("button", { name: /Gear filters/ }));
    const chips = within(await within(sheet).findByTestId("auction-filter-bis"));
    expect(chips.getByRole("button", { name: "Off" })).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(chips.getByRole("button", { name: "#2" }));
    expect(url()).toBe("?bis=2");
    await waitFor(() => expect(names()).toEqual(["Neck 30"]));
    expect(badges()).toEqual(["#2 Neck"]);
    expect(chips.getByRole("button", { name: "#2" })).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(chips.getByRole("button", { name: "Off" }));
    expect(url()).toBe("");
    expect(names()).toHaveLength(ITEMS.length);
  });

  it("picks for the level in the link, and names it", async () => {
    renderPage("/wow-forever/auction-house?bis=any&bisLvl=20");
    await waitFor(() => expect(names()).toEqual(["Neck 15"]));
    expect(screen.getByRole("button", { name: "Remove filter: Top 3 for level 20 Warlock" })).toBeInTheDocument();
  });

  it("uses the player's saved level and class", async () => {
    window.localStorage.setItem(
      PLAYER_SETTINGS_STORAGE_KEY,
      JSON.stringify({ faction: "A", classId: "mage", zoneId: null, level: 20, position: null }),
    );
    renderPage("/wow-forever/auction-house?bis=any");
    await waitFor(() => expect(names()).toEqual(["Neck 15"]));
    expect(screen.getByRole("button", { name: "Remove filter: Top 3 for level 20 Mage" })).toBeInTheDocument();
  });

  it("removing the chip drops the filter and the level from the link", async () => {
    renderPage("/wow-forever/auction-house?bis=any&bisLvl=20");
    await userEvent.click(await screen.findByRole("button", { name: "Remove filter: Top 3 for level 20 Warlock" }));
    expect(url()).toBe("");
    expect(names()).toHaveLength(ITEMS.length);
  });

  it("ignores a rank that isn't one", () => {
    renderPage("/wow-forever/auction-house?bis=7");
    expect(names()).toHaveLength(ITEMS.length);
    expect(screen.queryByTestId("auction-active-filters")).toBeNull();
  });
});
