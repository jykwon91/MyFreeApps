import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import WowFoodDetailPage from "@/games/wow-forever/pages/WowFoodDetailPage";
import WowFoodPickerPage from "@/games/wow-forever/pages/WowFoodPickerPage";
import { PLAYER_SETTINGS_STORAGE_KEY } from "@/games/wow-forever/hooks/usePlayerSettings";

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="where">{`${location.pathname}${location.search}`}</output>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/wow-forever/food" element={<WowFoodPickerPage />} />
        <Route path="/wow-forever/food/:foodId" element={<WowFoodDetailPage />} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  );
}

function section(name: string) {
  return screen.getByRole("heading", { level: 2, name }).closest("section") as HTMLElement;
}

describe("food detail page", () => {
  beforeEach(() => window.localStorage.clear());

  it("opens from the picker, carrying the question, and Back returns to it", async () => {
    const user = userEvent.setup();
    renderAt("/wow-forever/food?lvl=35&class=warrior");
    await user.click(screen.getByRole("link", { name: "Poached Sunscale Salmon" }));
    expect(screen.getByRole("heading", { level: 1, name: "Poached Sunscale Salmon" })).toBeInTheDocument();
    expect(screen.getByTestId("where").textContent).toMatch(/^\/wow-forever\/food\/\d+\?.*lvl=35/);

    await user.click(screen.getByRole("link", { name: "Back to What should I eat?" }));
    expect(screen.getByTestId("where").textContent).toMatch(/^\/wow-forever\/food\?.*lvl=35/);
  });

  it("shows where to buy the recipe, the quest, and directions", () => {
    renderAt("/wow-forever/food/733");
    expect(screen.getByText("Buy the recipe from Kendor Kabonka in Stormwind City.")).toBeInTheDocument();
    const recipe = section("Learn the recipe");
    expect(within(recipe).getByText("Cooking 75 to learn · green at 115 · grey at 155")).toBeInTheDocument();
    expect(within(recipe).getByRole("link", { name: "Directions to Kendor Kabonka" })).toHaveAttribute(
      "href",
      "/wow-forever/map?to=pt%3A1453%2C77.5%2C52.7&dir=1",
    );
    expect(within(recipe).getByText(/Westfall Stew/, { selector: "span" })).toBeInTheDocument();
  });

  it("lists each ingredient with where it drops", () => {
    renderAt("/wow-forever/food/733");
    const need = section("What you need");
    expect(within(need).getByRole("heading", { level: 3, name: "1× Goretusk Snout" })).toBeInTheDocument();
    expect(within(need).getByText(/^Goretusk \(level 14–15\)/)).toBeInTheDocument();
    expect(within(need).getByText("Moonbrook, Westfall · 45.6, 57.4")).toBeInTheDocument();
    expect(within(need).getByRole("link", { name: "Directions to Goretusk" })).toHaveAttribute(
      "href",
      "/wow-forever/map?to=pt%3A1436%2C45.6%2C57.4&dir=1",
    );
  });

  it("puts the player's faction first and hides the other faction's vendors until asked", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      PLAYER_SETTINGS_STORAGE_KEY,
      JSON.stringify({ faction: "H", classId: "warrior", zoneId: null, level: 10, position: null }),
    );
    renderAt("/wow-forever/food/733");
    expect(screen.getByText("Only the other faction's vendors sell the recipe.")).toBeInTheDocument();
    const recipe = section("Learn the recipe");
    expect(within(recipe).getByText("Only Alliance vendors sell it.")).toBeInTheDocument();
    await user.click(within(recipe).getByRole("button", { name: "Show 1 Alliance vendor" }));
    expect(within(recipe).getByText("— you can't buy from these")).toBeInTheDocument();
    expect(within(within(recipe).getByRole("list", { name: "Alliance vendor" })).getByText("Kendor Kabonka")).toBeInTheDocument();
  });

  it("says when a Forever recipe's source isn't known, and names the Iron Oven", () => {
    renderAt("/wow-forever/food/250070");
    expect(within(section("Learn the recipe")).getByText("New in Forever — where to get the recipe isn't known yet.")).toBeInTheDocument();
    expect(within(section("Where to cook it")).getByText(/Iron Oven/)).toBeInTheDocument();
  });

  it("sends trainer recipes to the Cooking guide", () => {
    renderAt("/wow-forever/food/5527");
    expect(screen.getByRole("link", { name: "Find a Cooking trainer in the Cooking guide" })).toHaveAttribute(
      "href",
      "/wow-forever/professions",
    );
  });

  it("handles a link to no food", () => {
    renderAt("/wow-forever/food/999");
    expect(screen.getByRole("heading", { level: 1, name: "Food not found" })).toBeInTheDocument();
  });
});

describe("Worth training for, when just healing", () => {
  beforeEach(() => window.localStorage.clear());

  it("describes the heal, not a stat buff", () => {
    renderAt("/wow-forever/food?lvl=60&class=warrior&act=healing&skill=1");
    const train = section("Worth training for");
    const line = within(train).getByText(/is better, but your Cooking is/).textContent ?? "";
    expect(line).toMatch(/\([\d,]+ health over \d+ sec\) is better/);
  });
});
