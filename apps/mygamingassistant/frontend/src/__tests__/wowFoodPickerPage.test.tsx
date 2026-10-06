import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import WowFoodPickerPage from "@/games/wow-forever/pages/WowFoodPickerPage";
import { FOOD_SETTINGS_STORAGE_KEY } from "@/games/wow-forever/hooks/useFoodPickerSettings";
import { PLAYER_SETTINGS_STORAGE_KEY } from "@/games/wow-forever/hooks/usePlayerSettings";

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="search">{location.search}</output>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/wow-forever/food"
          element={
            <>
              <WowFoodPickerPage />
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

function topPick() {
  return screen.getByRole("heading", { level: 2, name: (_, el) => el.id === "food-top-pick" });
}

/** These tests pick levels past the beta cap: run them after launch. */
const AFTER_LAUNCH = new Date("2026-11-05T12:00:00Z");
const IN_BETA = new Date("2026-10-05T12:00:00Z");

function at(date: Date) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(date);
}

describe("What should I eat? page", () => {
  beforeEach(() => {
    window.localStorage.clear();
    at(AFTER_LAUNCH);
  });
  afterEach(() => vi.useRealTimers());

  it("in the beta, stops at level 30 and says why", () => {
    at(IN_BETA);
    renderAt("/wow-forever/food?lvl=45&class=warlock&act=leveling");
    expect(screen.getByLabelText("Level")).toHaveValue(30);
    expect(screen.getByText(/Best food for a level 30 Warlock leveling\./)).toBeInTheDocument();
    expect(screen.getByText(/The beta stops at level 30/)).toBeInTheDocument();
    expect(screen.queryByText(/Next upgrade at level/)).not.toBeInTheDocument();
  });

  it("asks for a level first", () => {
    renderAt("/wow-forever/food");
    expect(screen.getByText("Enter a level to see what to cook.")).toBeInTheDocument();
  });

  it("answers from the URL", () => {
    renderAt("/wow-forever/food?lvl=35&class=warrior&act=leveling");
    expect(topPick()).toHaveTextContent("Poached Sunscale Salmon");
    expect(screen.getByText(/Best food for a level 35 Warrior leveling\./)).toBeInTheDocument();
    expect(screen.getByText(/Next upgrade at level 55/)).toBeInTheDocument();
  });

  it("changes the answer with the activity and keeps it in the URL", async () => {
    const user = userEvent.setup();
    renderAt("/wow-forever/food?lvl=35&class=warrior");
    await user.click(screen.getByRole("radio", { name: "Fishing" }));
    expect(topPick()).toHaveTextContent("Filet of Redgill");
    expect(screen.getByTestId("search")).toHaveTextContent("act=fishing");
    expect(JSON.parse(window.localStorage.getItem(FOOD_SETTINGS_STORAGE_KEY) ?? "{}").activity).toBe("fishing");
  });

  it("shows what's worth training for when Cooking skill is too low", () => {
    renderAt("/wow-forever/food?lvl=35&class=warrior&skill=100");
    expect(screen.getByRole("heading", { name: "Worth training for" })).toBeInTheDocument();
    expect(screen.getByText(/your Cooking is 100/)).toBeInTheDocument();
  });

  it("starts from the World Map's level and class", () => {
    window.localStorage.setItem(
      PLAYER_SETTINGS_STORAGE_KEY,
      JSON.stringify({ faction: "H", classId: "mage", zoneId: null, level: 20, position: null }),
    );
    renderAt("/wow-forever/food");
    expect(screen.getByLabelText("Level")).toHaveValue(20);
    expect(screen.getByLabelText("Class")).toHaveValue("mage");
  });
});
