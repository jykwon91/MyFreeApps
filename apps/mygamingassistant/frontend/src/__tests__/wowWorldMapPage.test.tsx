import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import WowWorldMapPage from "@/games/wow-forever/pages/WowWorldMapPage";
import { PLAYER_SETTINGS_STORAGE_KEY } from "@/games/wow-forever/hooks/usePlayerSettings";

function renderPage() {
  return render(
    <MemoryRouter>
      <WowWorldMapPage />
    </MemoryRouter>,
  );
}

describe("WoW Forever World Map page", () => {
  beforeEach(() => window.localStorage.clear());

  it("asks for a zone first, then lists the nearest Warlock trainer", async () => {
    renderPage();
    expect(await screen.findByText(/Pick your zone above/)).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("Class"), "warlock");
    await userEvent.selectOptions(screen.getByLabelText("Zone"), "Elwynn Forest");

    // Measured from the middle of the zone, Northshire is closest.
    const trainer = await screen.findByRole("article", { name: "Warlock trainer: Drusilla La Salle" });
    expect(within(trainer).getByText(/Northshire Valley, Elwynn Forest/)).toBeInTheDocument();
    expect(within(trainer).getByText("Classic location — may differ in Forever")).toBeInTheDocument();
    expect(within(trainer).getByRole("button", { name: "Copy in-game waypoint" })).toBeInTheDocument();

    const stored = JSON.parse(window.localStorage.getItem(PLAYER_SETTINGS_STORAGE_KEY) ?? "{}");
    expect(stored).toMatchObject({ faction: "A", classId: "warlock", zoneId: 1429 });
  });

  it("shows directions for a result and a typed position moves you", async () => {
    window.localStorage.setItem(
      PLAYER_SETTINGS_STORAGE_KEY,
      JSON.stringify({ faction: "A", classId: "warlock", zoneId: 1429, level: null, position: null }),
    );
    renderPage();
    expect(await screen.findByText(/Measuring from the middle of Elwynn Forest/)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/Your coordinates/), "/way 42 65");
    await userEvent.click(screen.getByRole("button", { name: "Set position" }));
    expect(screen.queryByText(/Measuring from the middle/)).not.toBeInTheDocument();

    const trainer = screen.getByRole("article", { name: "Warlock trainer: Maximillian Crowe" });
    await userEvent.click(within(trainer).getByRole("button", { name: /Directions/ }));
    const steps = within(trainer).getByRole("list", { name: "Directions" });
    expect(within(steps).getByText(/^Head .*~\d+ yd, to Maximillian Crowe/)).toBeInTheDocument();
  });

  it("lists quests for your level and colours dungeons you can't enter yet", async () => {
    window.localStorage.setItem(
      PLAYER_SETTINGS_STORAGE_KEY,
      JSON.stringify({ faction: "A", classId: "warlock", zoneId: 1429, level: 1, position: { x: 48, y: 42 } }),
    );
    renderPage();
    const quests = await screen.findByRole("region", { name: "Quests near you" });
    const willem = within(quests).getByRole("article", { name: "Quest giver: Deputy Willem" });
    expect(within(willem).getByRole("list", { name: "Quests from Deputy Willem" })).toHaveTextContent("A Threat Within");

    const dungeons = screen.getByRole("region", { name: "Dungeons & raids" });
    const stockade = within(dungeons).getByRole("article", { name: "Dungeon: Stormwind Stockade" });
    expect(within(stockade).getByText(/Level 23 in Forever · opens at level 15 — too low to enter yet/)).toBeInTheDocument();
  });

  it("warns on a zone that's new in Forever", async () => {
    window.localStorage.setItem(
      PLAYER_SETTINGS_STORAGE_KEY,
      JSON.stringify({ faction: "H", classId: "mage", zoneId: 2548, level: null, position: null }),
    );
    renderPage();
    expect(await screen.findByText(/Riverglades is new in Forever and not mapped yet/)).toBeInTheDocument();
  });
});
