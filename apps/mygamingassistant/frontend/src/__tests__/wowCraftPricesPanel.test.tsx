import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import CraftRouteSections from "@/games/wow-forever/components/crafting/CraftRouteSections";
import alchemyJson from "@/games/wow-forever/data/professions/crafting/alchemy.json";
import sourcesJson from "@/games/wow-forever/data/professions/crafting/classic/sources.json";
import enchantingJson from "@/games/wow-forever/data/professions/crafting/enchanting.json";
import trainerSkillsJson from "@/games/wow-forever/data/professions/crafting/classic/trainerSkills.json";
import { createSourceLookup, type RawSourcesFile } from "@/games/wow-forever/data/sourceDecode";
import type { CraftingData } from "@/games/wow-forever/hooks/useCraftingData";
import { LEGACY_PRICES_STORAGE_KEY, PRICE_OVERRIDES_STORAGE_KEY } from "@/games/wow-forever/hooks/useCraftPrices";
import { FACTION } from "@/games/wow-forever/types/worldMap";
import type { CraftingFile, CraftingProfession, TrainerSkills } from "@/games/wow-forever/types/crafting";
import { priceList, pricesFailed, pricesReady } from "@/test/auctionPricesStub";

const usePricesQuery = vi.hoisted(() => vi.fn());
vi.mock("@/games/wow-forever/api/wowPricesApi", () => ({ useGetWowPricesQuery: usePricesQuery }));

const SOURCES = createSourceLookup(sourcesJson as unknown as RawSourcesFile);
const TRAINER_SKILLS = trainerSkillsJson as unknown as Record<CraftingProfession, TrainerSkills>;

function dataFor(json: unknown, profession: CraftingProfession): CraftingData {
  const file = json as CraftingFile;
  return {
    file,
    recipes: new Map(file.recipes.map((r) => [r.spell, r])),
    trainerSkills: TRAINER_SKILLS[profession],
    sources: SOURCES,
  };
}

const ENCHANTING = dataFor(enchantingJson, "enchanting");
const ALCHEMY = dataFor(alchemyJson, "alchemy");
const STRANGE_DUST = 10940;
// Copper Rod + Strange Dust price the first rows: Runed Copper Rod, then Dust to Motes. Nothing else has a price.
const FIRST_ROWS = priceList([
  [STRANGE_DUST, 60, "Strange Dust"],
  [6217, 124, "Copper Rod"],
]);

function renderSections(profession: CraftingProfession = "enchanting", data: CraftingData = ENCHANTING) {
  return render(
    <MemoryRouter initialEntries={[`/wow-forever/professions?p=${profession}`]}>
      <CraftRouteSections profession={profession} faction={FACTION.alliance} zoneId={null} level={null} data={data} />
    </MemoryRouter>,
  );
}

function routeSection() {
  const section = document.getElementById("route");
  if (!section) throw new Error("no route section");
  return within(section);
}

async function openPanel() {
  await userEvent.click(screen.getByRole("button", { name: /^Prices/ }));
}

describe("auction prices on a crafting guide", () => {
  beforeEach(() => {
    window.localStorage.clear();
    usePricesQuery.mockReturnValue(pricesReady(FIRST_ROWS));
  });

  it("finds the cheapest route from auction prices with nothing typed, and credits the source", async () => {
    renderSections();
    expect(routeSection().getByText("Cheapest at auction prices")).toBeInTheDocument();
    // The rows after the first ones need materials this stub has no price for.
    expect(routeSection().getByText(/^Estimated cost to reach skill \d+: ~/)).toBeInTheDocument();
    expect(routeSection().getByText(/^Auction prices for 2 of \d+ materials\.$/)).toBeInTheDocument();
    const credit = screen.getByTestId("price-credit");
    expect(within(credit).getByRole("link", { name: "TradeSkillMaster" })).toHaveAttribute("href", "https://www.tradeskillmaster.com");
    expect(credit).toHaveTextContent(/Prices from TradeSkillMaster · updated/);

    await userEvent.click(screen.getByRole("checkbox", { name: "Use default route" }));
    expect(routeSection().getByText("Default route")).toBeInTheDocument();
  });

  it("shows each material's auction price, and says when there is none", async () => {
    renderSections();
    await openPanel();
    const dust = screen.getByLabelText("Strange Dust");
    expect(dust).toHaveValue("");
    expect(dust).toHaveAttribute("placeholder", "60c");
    expect(screen.getByText("Auction price 60c")).toBeInTheDocument();
    expect(screen.getAllByText("No auction price").length).toBeGreaterThan(0);
  });

  it("keeps a price you type as an override, saved apart from the auction prices", async () => {
    renderSections();
    await openPanel();
    const dust = screen.getByLabelText("Strange Dust");
    fireEvent.change(dust, { target: { value: "1g 20s" } });
    expect(screen.getByText(/^= 1g 20s · yours/)).toBeInTheDocument();
    fireEvent.blur(dust);
    expect(JSON.parse(window.localStorage.getItem(PRICE_OVERRIDES_STORAGE_KEY) ?? "{}")).toEqual({ "10940": 12000 });
    expect(routeSection().getByText(/1 you set yourself/)).toBeInTheDocument();
  });

  it("flags a price it can't read", async () => {
    renderSections();
    await openPanel();
    const dust = screen.getByLabelText("Strange Dust");
    fireEvent.change(dust, { target: { value: "lots" } });
    expect(dust).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Try 1g 20s")).toBeInTheDocument();
  });

  it("goes back to auction prices for all, with an undo", async () => {
    window.localStorage.setItem(PRICE_OVERRIDES_STORAGE_KEY, JSON.stringify({ "10940": 30 }));
    renderSections();
    await openPanel();
    expect(screen.getByLabelText("Strange Dust")).toHaveValue("30c");
    await userEvent.click(screen.getByRole("button", { name: "Use auction prices for all" }));
    expect(screen.getByLabelText("Strange Dust")).toHaveValue("");
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByLabelText("Strange Dust")).toHaveValue("30c");
  });

  it("drops the prices typed before auction prices existed", () => {
    window.localStorage.setItem(LEGACY_PRICES_STORAGE_KEY, JSON.stringify({ "10940": 99999 }));
    renderSections();
    expect(window.localStorage.getItem(LEGACY_PRICES_STORAGE_KEY)).toBeNull();
    expect(routeSection().queryByText(/you set yourself/)).toBeNull();
  });

  it("shows the route without prices, and a retry, when the prices don't load", async () => {
    const failed = pricesFailed();
    usePricesQuery.mockReturnValue(failed);
    renderSections();
    expect(screen.getByText("Couldn't load prices — showing routes without prices.")).toBeInTheDocument();
    expect(routeSection().getByText("Default route")).toBeInTheDocument();
    expect(routeSection().queryByText(/^Estimated cost/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(failed.refetch).toHaveBeenCalled();
  });

  it("prices a guide without a cheapest route too: costs on the hand-picked route, no override panel", () => {
    // Peacebloom + Silverleaf + Empty Vial: Minor Healing Potion, Alchemy's first rows.
    usePricesQuery.mockReturnValue(
      pricesReady(priceList([
        [2447, 40, "Peacebloom"],
        [765, 30, "Silverleaf"],
        [3371, 4, "Empty Vial"],
      ])),
    );
    renderSections("alchemy", ALCHEMY);
    expect(routeSection().getByText(/^Estimated cost to/)).toBeInTheDocument();
    expect(routeSection().queryByText(/cheapest/i)).toBeNull();
    expect(screen.queryByRole("region", { name: "Prices" })).toBeNull();
  });
});
