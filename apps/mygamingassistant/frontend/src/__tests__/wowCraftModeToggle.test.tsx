import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { store } from "@/lib/store";
import { MemoryRouter } from "react-router-dom";
import CraftRouteSections from "@/games/wow-forever/components/crafting/CraftRouteSections";
import tailoringJson from "@/games/wow-forever/data/professions/crafting/tailoring.json";
import enchantingJson from "@/games/wow-forever/data/professions/crafting/enchanting.json";
import sourcesJson from "@/games/wow-forever/data/professions/crafting/classic/sources.json";
import trainerSkillsJson from "@/games/wow-forever/data/professions/crafting/classic/trainerSkills.json";
import { createSourceLookup, type RawSourcesFile } from "@/games/wow-forever/data/sourceDecode";
import { craftContext } from "@/games/wow-forever/crafting/pricedRoute";
import { priceItems } from "@/games/wow-forever/crafting/priceItems";
import { FACTION } from "@/games/wow-forever/types/worldMap";
import type { CraftingData } from "@/games/wow-forever/types/craftingData";
import type { CraftingFile, CraftingProfession, TrainerSkills } from "@/games/wow-forever/types/crafting";
import { priceList, pricesReady } from "@/test/auctionPricesStub";

const usePricesQuery = vi.hoisted(() => vi.fn());
vi.mock("@/games/wow-forever/api/wowPricesApi", () => ({ useGetWowPricesQuery: usePricesQuery }));

const SOURCES = createSourceLookup(sourcesJson as unknown as RawSourcesFile);
const TRAINER_SKILLS = trainerSkillsJson as unknown as Record<CraftingProfession, TrainerSkills>;
const MATERIAL_PRICE = 100;
const PRODUCT_PRICE = 50_000;

function dataFor(json: unknown, profession: CraftingProfession): CraftingData {
  const file = json as CraftingFile;
  return { file, recipes: new Map(file.recipes.map((r) => [r.spell, r])), trainerSkills: TRAINER_SKILLS[profession], sources: SOURCES };
}

const TAILORING = dataFor(tailoringJson, "tailoring");
const ENCHANTING = dataFor(enchantingJson, "enchanting");

/** Every material at one price and every product at a high one, each with enough listings to count. */
function pricedTailoring() {
  const items = priceItems(craftContext("tailoring", TAILORING), 1, { knownFormulas: new Set(), excludedSlots: new Set() });
  const rows = new Map<number, [number, number, string]>();
  for (const recipe of TAILORING.file.recipes) {
    if (recipe.creates && !recipe.enchant) rows.set(recipe.creates.id, [recipe.creates.id, PRODUCT_PRICE, recipe.creates.name]);
  }
  for (const item of [...items.main, ...items.more]) if (!rows.has(item.id)) rows.set(item.id, [item.id, MATERIAL_PRICE, item.name]);
  return pricesReady(priceList([...rows.values()]));
}

function renderSections(profession: CraftingProfession, data: CraftingData) {
  return render(
    <Provider store={store}>
    <MemoryRouter initialEntries={[`/wow-forever/professions?p=${profession}`]}>
      <CraftRouteSections profession={profession} faction={FACTION.alliance} zoneId={null} level={null} position={null} data={data} />
    </MemoryRouter>
</Provider>,
  );
}

function route() {
  const section = document.getElementById("route");
  if (!section) throw new Error("no route section");
  return within(section);
}

function routeChoice() {
  return within(route().getByRole("radiogroup", { name: "Route" }));
}

describe("the route choice on a crafting guide", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("offers Cheapest, Most profit and Default for a profession that makes items", () => {
    usePricesQuery.mockReturnValue(pricedTailoring());
    renderSections("tailoring", TAILORING);
    expect(routeChoice().getAllByRole("radio").map((r) => r.getAttribute("aria-label") ?? r.textContent)).toEqual(["Cheapest", "Most profit", "Default"]);
    expect(routeChoice().getByRole("radio", { name: "Cheapest" })).toBeChecked();
    expect(route().getByText("Cheapest at auction prices")).toBeInTheDocument();
  });

  it("shows each row's materials, what it sells for and its net, and a profit summary, in Most profit", async () => {
    usePricesQuery.mockReturnValue(pricedTailoring());
    renderSections("tailoring", TAILORING);
    await userEvent.click(routeChoice().getByRole("radio", { name: "Most profit" }));
    expect(route().getByText("Most profit at auction prices")).toBeInTheDocument();
    expect(route().getByText(/^Estimated net to (reach skill )?\d+: \+.* profit/)).toBeInTheDocument();
    const rows = route().getAllByTestId("craft-row-profit");
    expect(rows.length).toBeGreaterThan(0);
    expect(within(rows[0]).getByText("Materials")).toBeInTheDocument();
    expect(within(rows[0]).getByText("Sells for")).toBeInTheDocument();
    expect(within(rows[0]).getByTestId("craft-row-net")).toHaveTextContent(/^\+.* profit$/);
    expect(route().getByText(/A product counts only when 5 or more are on sale/)).toBeInTheDocument();
  });

  it("goes back to the cheapest route and the default one", async () => {
    usePricesQuery.mockReturnValue(pricedTailoring());
    renderSections("tailoring", TAILORING);
    await userEvent.click(routeChoice().getByRole("radio", { name: "Most profit" }));
    await userEvent.click(routeChoice().getByRole("radio", { name: "Cheapest" }));
    expect(route().getByText("Cheapest at auction prices")).toBeInTheDocument();
    expect(route().queryByTestId("craft-row-profit")).toBeNull();
    await userEvent.click(routeChoice().getByRole("radio", { name: "Default" }));
    expect(route().getByText("Default route")).toBeInTheDocument();
  });

  it("leaves Most profit out for Enchanting, which makes no items to sell", () => {
    usePricesQuery.mockReturnValue(pricesReady(priceList([[10940, 60, "Strange Dust"], [6217, 124, "Copper Rod"]])));
    renderSections("enchanting", ENCHANTING);
    expect(routeChoice().getByRole("radio", { name: "Cheapest" })).toBeInTheDocument();
    expect(routeChoice().queryByRole("radio", { name: "Most profit" })).toBeNull();
  });

  it("shows only the default route, and no choice, while there are no prices", () => {
    usePricesQuery.mockReturnValue(pricesReady(priceList([])));
    renderSections("tailoring", TAILORING);
    expect(route().queryByRole("radiogroup", { name: "Route" })).toBeNull();
    expect(screen.getByText("Default route")).toBeInTheDocument();
  });
});
