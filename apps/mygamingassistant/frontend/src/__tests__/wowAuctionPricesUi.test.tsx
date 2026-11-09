import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import FoodPriceSection from "@/games/wow-forever/components/food/detail/FoodPriceSection";
import FoodPriceLine from "@/games/wow-forever/components/food/FoodPriceLine";
import GoldFarmCard from "@/games/wow-forever/components/gold/GoldFarmCard";
import PriceStatus from "@/games/wow-forever/components/prices/PriceStatus";
import { FOODS } from "@/games/wow-forever/data/food/foodData";
import { clothPerHour } from "@/games/wow-forever/gold/goldFarms";
import { goldFarms } from "@/games/wow-forever/gold/goldFarmsData";
import { PLAYER_SETTINGS_STORAGE_KEY } from "@/games/wow-forever/hooks/usePlayerSettings";
import { REGION_STORAGE_KEY } from "@/games/wow-forever/hooks/useWowRegion";
import { mapPriceList } from "@/games/wow-forever/prices/auctionPrices";
import type { PriceHouse } from "@/games/wow-forever/types/priceHouse";
import { priceList, pricesLoading, pricesReady } from "@/test/auctionPricesStub";

const usePricesQuery = vi.hoisted(() => vi.fn());
vi.mock("@/games/wow-forever/api/wowPricesApi", () => ({ useGetWowPricesQuery: usePricesQuery }));

function food(name: string) {
  const found = FOODS.find((f) => f.name === name);
  if (!found) throw new Error(`no ${name}`);
  return found;
}

const SMOKED_BEAR = food("Smoked Bear Meat"); // Bear Meat; learnt from Recipe: Smoked Bear Meat
const SPICED_WOLF = food("Spiced Wolf Meat"); // Stringy Wolf Meat + Mild Spices (vendor only)

describe("Buy or cook?", () => {
  beforeEach(() => window.localStorage.clear());

  it("prices the ingredients, the food and the recipe, and says which is cheaper", () => {
    usePricesQuery.mockReturnValue(
      pricesReady(priceList([
        [3173, 40, "Bear Meat"],
        [SMOKED_BEAR.id, 150, "Smoked Bear Meat"],
        [6892, 2500, "Recipe: Smoked Bear Meat"],
      ])),
    );
    render(<FoodPriceSection food={SMOKED_BEAR} />);
    const prices = screen.getByTestId("food-prices");
    expect(within(prices).getByText("Ingredients for one cook").nextSibling).toHaveTextContent("~40c");
    expect(within(prices).getByText("Buy Smoked Bear Meat at the auction house").nextSibling).toHaveTextContent("~1s 50c");
    expect(within(prices).getByText("Cheaper to cook: saves ~1s 10c on each one.")).toBeInTheDocument();
    expect(within(prices).getByText("The recipe (Recipe: Smoked Bear Meat)").nextSibling).toHaveTextContent("~25s");
    expect(screen.getByTestId("price-credit")).toHaveTextContent("Prices from Blizzard (PvP · Alliance AH, US) · updated");
  });

  it("labels what has no auction price and gives no verdict", () => {
    usePricesQuery.mockReturnValue(pricesReady(priceList([[2672, 15, "Stringy Wolf Meat"]])));
    render(<FoodPriceSection food={SPICED_WOLF} />);
    const prices = screen.getByTestId("food-prices");
    expect(within(prices).getByText("plus Mild Spices (no auction price)")).toBeInTheDocument();
    expect(within(prices).getByText("Buy Spiced Wolf Meat at the auction house").nextSibling).toHaveTextContent("no auction price");
    expect(within(prices).queryByText(/^Cheaper to/)).toBeNull();
  });

  it("shows a skeleton line while the prices load", () => {
    usePricesQuery.mockReturnValue(pricesLoading());
    render(<FoodPriceSection food={SMOKED_BEAR} />);
    expect(screen.getByTestId("price-credit-skeleton")).toBeInTheDocument();
    expect(screen.queryByTestId("food-prices")).toBeNull();
  });

  it("sums up a pick on the food picker", () => {
    usePricesQuery.mockReturnValue(pricesReady(priceList([[2672, 15, "Stringy Wolf Meat"], [SPICED_WOLF.id, 90, "Spiced Wolf Meat"]])));
    render(<FoodPriceLine food={SPICED_WOLF} />);
    expect(screen.getByTestId("food-price-line")).toHaveTextContent("Cook ~15c + 1 item with no auction price · Buy ~90c");
  });
});

describe("gold farm card", () => {
  const farm = goldFarms().find((f) => f.cloth === "Linen Cloth" && clothPerHour(f) > 0);

  it("puts an auction value on an hour of cloth", () => {
    if (!farm) throw new Error("no linen farm");
    const prices = mapPriceList(priceList([[2589, 100, "Linen Cloth"]]));
    render(
      <MemoryRouter>
        <GoldFarmCard farm={farm} rank={1} skinning={false} prices={prices} />
      </MemoryRouter>,
    );
    const hour = Math.round(clothPerHour(farm));
    expect(screen.getByText(new RegExp(`${hour} Linen Cloth`)).closest("li")).toHaveTextContent(/at the auction house/);
  });

  it("keeps the advice to keep cloth while there are no prices", () => {
    if (!farm) throw new Error("no linen farm");
    render(
      <MemoryRouter>
        <GoldFarmCard farm={farm} rank={1} skinning={false} prices={null} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/keep it, players pay more than a vendor/)).toBeInTheDocument();
  });
});

describe("whose prices: your faction's, US only", () => {
  beforeEach(() => {
    window.localStorage.clear();
    usePricesQuery.mockReset();
    usePricesQuery.mockImplementation(({ faction }: PriceHouse) => pricesReady(priceList([[2589, 28, "Linen Cloth"]], undefined, faction)));
  });

  function saveFaction(faction: "A" | "H") {
    window.localStorage.setItem(
      PLAYER_SETTINGS_STORAGE_KEY,
      JSON.stringify({ faction, classId: "warlock", zoneId: null, level: null, position: null }),
    );
  }

  it("credits Blizzard and the Alliance house by default, with no region picker", () => {
    render(<PriceStatus withoutPrices="showing routes without prices" />);
    expect(screen.getByTestId("price-credit")).toHaveTextContent(/^Prices from Blizzard \(PvP · Alliance AH, US\) · updated /);
    expect(screen.queryByRole("combobox", { name: "Region" })).toBeNull();
    expect(usePricesQuery).toHaveBeenLastCalledWith({ server: "pvp", faction: "alliance" });
  });

  it("follows the saved faction, and ignores the server status region", () => {
    saveFaction("H");
    window.localStorage.setItem(REGION_STORAGE_KEY, JSON.stringify("eu"));
    render(<PriceStatus withoutPrices="showing routes without prices" />);
    expect(usePricesQuery).toHaveBeenLastCalledWith({ server: "pvp", faction: "horde" });
    expect(screen.getByTestId("price-credit")).toHaveTextContent("(PvP · Horde AH, US)");
  });

  it("says plainly when that house has no prices yet", () => {
    usePricesQuery.mockImplementation(({ faction }: PriceHouse) => pricesReady(priceList([], undefined, faction)));
    render(<PriceStatus withoutPrices="showing routes without prices" />);
    expect(screen.getByTestId("price-credit")).toHaveTextContent(/^No PvP · Alliance auction prices yet\./);
  });

  it("warns about old prices", () => {
    usePricesQuery.mockImplementation(({ faction }: PriceHouse) =>
      pricesReady(priceList([[2589, 28, "Linen Cloth"]], "2020-01-01T00:00:00Z", faction)),
    );
    render(<PriceStatus withoutPrices="showing routes without prices" />);
    expect(screen.getByTestId("price-credit")).toHaveTextContent("these may be out of date");
  });
});

