import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import WowWorldMapPage from "@/games/wow-forever/pages/WowWorldMapPage";
import { PLAYER_SETTINGS_STORAGE_KEY } from "@/games/wow-forever/hooks/usePlayerSettings";
import type { MapCapture } from "@/games/wow-forever/types/mapCapture";

const capturesQuery = vi.hoisted(() => ({
  data: { captures: [] as MapCapture[] },
  isLoading: false,
  isError: false,
}));

vi.mock("@/games/wow-forever/api/wowMapCapturesApi", () => ({
  useGetMapCapturesQuery: () => capturesQuery,
  useImportMapCapturesMutation: () => [vi.fn(), { isLoading: false }],
}));

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

  it("shows where a trainer was captured in Forever instead of the Classic spot", async () => {
    capturesQuery.data = {
      captures: [
        {
          capture_key: "npc:906:service",
          kind: "service",
          subkind: "class_trainer",
          tag: "warlock",
          npc_id: 906,
          name: "Maximillian Crowe",
          title: "Warlock Trainer",
          zone_id: 1429,
          subzone: "Goldshire",
          x: 43.1,
          y: 65.5,
          faction: "A",
          captured_at: "2026-09-20T18:00:00.000Z",
        },
      ],
    };
    window.localStorage.setItem(
      PLAYER_SETTINGS_STORAGE_KEY,
      JSON.stringify({ faction: "A", classId: "warlock", zoneId: 1429, level: null, position: { x: 42, y: 65 } }),
    );
    renderPage();
    const trainer = await screen.findByRole("article", { name: "Warlock trainer: Maximillian Crowe" });
    expect(within(trainer).getByText(/Goldshire, Elwynn Forest \(43\.1, 65\.5\)/)).toBeInTheDocument();
    expect(within(trainer).getByText(/^Captured in Forever/)).toBeInTheDocument();
    capturesQuery.data = { captures: [] };
  });

  it("clicking a result opens its map and highlights it, without moving you", async () => {
    window.localStorage.setItem(
      PLAYER_SETTINGS_STORAGE_KEY,
      JSON.stringify({ faction: "A", classId: "warlock", zoneId: 1429, level: null, position: { x: 42, y: 65 } }),
    );
    renderPage();
    const find = await screen.findByRole("region", { name: "Find" });
    const calder = within(find).getByRole("article", { name: "Alexander Calder" });
    await userEvent.click(within(calder).getByText(/Ironforge/, { selector: "span" }));

    expect(screen.getByRole("img", { name: "Ironforge map" })).toBeInTheDocument();
    const markers = screen.getByRole("group", { name: "Ironforge markers" });
    expect(within(markers).getByRole("button", { pressed: true })).toHaveAccessibleName(/Alexander Calder/);
    expect(calder).toHaveAttribute("aria-current", "true");
    const stored = JSON.parse(window.localStorage.getItem(PLAYER_SETTINGS_STORAGE_KEY) ?? "{}");
    expect(stored).toMatchObject({ zoneId: 1429, position: { x: 42, y: 65 } });
  });

  it("scrolls the map into view when a row is chosen on the stacked layout, and not when it's on screen", async () => {
    window.localStorage.setItem(
      PLAYER_SETTINGS_STORAGE_KEY,
      JSON.stringify({ faction: "A", classId: "warlock", zoneId: 1429, level: null, position: { x: 42, y: 65 } }),
    );
    const scrolled: Element[] = [];
    // jsdom has no scrollIntoView; record who asks.
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this);
    };
    // Everything sits below the fold, as the map does under the list on a narrow screen.
    const below = { top: 2000, bottom: 2400, left: 0, right: 600, width: 600, height: 400, x: 0, y: 2000 };
    const rectSpy = vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ ...below, toJSON: () => below });
    try {
      renderPage();
      const trainer = await screen.findByRole("article", { name: "Warlock trainer: Maximillian Crowe" });
      trainer.focus();
      await userEvent.keyboard("{Enter}");
      const map = screen.getByTestId("zone-map");
      expect(scrolled.some((el) => el.contains(map))).toBe(true);

      // Side by side: the map is already on screen — nothing scrolls.
      scrolled.length = 0;
      const onScreen = { ...below, top: 100, bottom: 500, y: 100 };
      rectSpy.mockReturnValue({ ...onScreen, toJSON: () => onScreen });
      trainer.focus();
      await userEvent.keyboard("{Enter}");
      expect(trainer).toHaveAttribute("aria-current", "true");
      expect(scrolled.some((el) => el.contains(screen.getByTestId("zone-map")))).toBe(false);
    } finally {
      delete (Element.prototype as Partial<Element>).scrollIntoView;
      rectSpy.mockRestore();
    }
  });

  it("Enter on a focused row shows it on the map; zoom out climbs the map tree", async () => {
    window.localStorage.setItem(
      PLAYER_SETTINGS_STORAGE_KEY,
      JSON.stringify({ faction: "A", classId: "warlock", zoneId: 1429, level: null, position: { x: 42, y: 65 } }),
    );
    renderPage();
    const trainer = await screen.findByRole("article", { name: "Warlock trainer: Maximillian Crowe" });
    trainer.focus();
    await userEvent.keyboard("{Enter}");
    expect(trainer).toHaveAttribute("aria-current", "true");
    const markers = screen.getByRole("group", { name: "Elwynn Forest markers" });
    expect(within(markers).getByRole("button", { pressed: true })).toHaveAccessibleName(/Maximillian Crowe/);

    await userEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(screen.getByRole("img", { name: "Eastern Kingdoms map" })).toBeInTheDocument();
    const levels = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(levels).toHaveTextContent("Azeroth");
    await userEvent.click(within(levels).getByRole("button", { name: "Azeroth" }));
    expect(screen.getByRole("img", { name: "Azeroth map" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Zoom out" })).toBeDisabled();
    await userEvent.selectOptions(screen.getByLabelText("Open a map"), "Zephras Isle");
    expect(screen.getByRole("img", { name: "Zephras Isle map" })).toBeInTheDocument();
    // Five map changes through userEvent: slow on a cold, busy CI worker.
  }, 15_000);

  it("warns on a zone that's new in Forever", async () => {
    window.localStorage.setItem(
      PLAYER_SETTINGS_STORAGE_KEY,
      JSON.stringify({ faction: "H", classId: "mage", zoneId: 2548, level: null, position: null }),
    );
    renderPage();
    expect(await screen.findByText(/Riverglades is new in Forever and not mapped yet/)).toBeInTheDocument();
  });
});
