import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
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
    // The first render pays for the cold import of the world data.
    expect(await screen.findByText(/Pick your zone above/, {}, { timeout: 4000 })).toBeInTheDocument();

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
      await userEvent.keyboard("{Escape}");
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

  // Each case renders the whole page and selects first: generous time on a busy CI worker.
  describe("letting go of a selection", { timeout: 20_000 }, () => {
    function renderInElwynn() {
      window.localStorage.setItem(
        PLAYER_SETTINGS_STORAGE_KEY,
        JSON.stringify({ faction: "A", classId: "warlock", zoneId: 1429, level: null, position: { x: 42, y: 65 } }),
      );
      renderPage();
    }

    async function selectCrowe() {
      const trainer = await screen.findByRole("article", { name: "Warlock trainer: Maximillian Crowe" });
      await userEvent.click(within(trainer).getByRole("heading", { name: "Maximillian Crowe" }));
      expect(trainer).toHaveAttribute("aria-current", "true");
      return trainer;
    }

    function pressedMarkers() {
      return within(screen.getByRole("group", { name: "Elwynn Forest markers" })).queryAllByRole("button", { pressed: true });
    }

    it("clicking the selected row again clears it", async () => {
      renderInElwynn();
      const trainer = await selectCrowe();
      await userEvent.click(within(trainer).getByRole("heading", { name: "Maximillian Crowe" }));
      expect(trainer).not.toHaveAttribute("aria-current");
      expect(pressedMarkers()).toHaveLength(0);
      expect(screen.getByRole("img", { name: "Elwynn Forest map" })).toBeInTheDocument();
    });

    it("the selected row's Clear button clears it", async () => {
      renderInElwynn();
      const trainer = await selectCrowe();
      await userEvent.click(within(trainer).getByRole("button", { name: "Clear selection: Maximillian Crowe" }));
      expect(trainer).not.toHaveAttribute("aria-current");
      expect(within(trainer).queryByRole("button", { name: /Clear selection/ })).not.toBeInTheDocument();
    });

    it("Esc clears the selection first, and only then zooms out", async () => {
      renderInElwynn();
      const trainer = await selectCrowe();
      screen.getByTestId("zone-map").focus();
      await userEvent.keyboard("{Escape}");
      expect(trainer).not.toHaveAttribute("aria-current");
      expect(screen.getByRole("img", { name: "Elwynn Forest map" })).toBeInTheDocument();

      await userEvent.keyboard("{Escape}");
      expect(screen.getByRole("img", { name: "Eastern Kingdoms map" })).toBeInTheDocument();
    });

    it("Esc on the list clears the selection", async () => {
      renderInElwynn();
      const trainer = await selectCrowe();
      trainer.focus();
      await userEvent.keyboard("{Escape}");
      expect(trainer).not.toHaveAttribute("aria-current");
      expect(screen.getByRole("img", { name: "Elwynn Forest map" })).toBeInTheDocument();
    });

    it("a click on the map clears the selection without moving you", async () => {
      renderInElwynn();
      const trainer = await selectCrowe();
      // jsdom lays nothing out: give the map a box so the click lands on it.
      const box = { top: 0, left: 0, right: 600, bottom: 400, width: 600, height: 400, x: 0, y: 0 };
      const rectSpy = vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ ...box, toJSON: () => box });
      try {
        const map = screen.getByTestId("zone-map");
        fireEvent.pointerDown(map, { button: 0, clientX: 300, clientY: 200 });
        fireEvent.pointerUp(map, { button: 0, clientX: 300, clientY: 200 });
      } finally {
        rectSpy.mockRestore();
      }
      expect(trainer).not.toHaveAttribute("aria-current");
      expect(pressedMarkers()).toHaveLength(0);
      expect(screen.getByRole("img", { name: "Elwynn Forest map" })).toBeInTheDocument();
      const stored = JSON.parse(window.localStorage.getItem(PLAYER_SETTINGS_STORAGE_KEY) ?? "{}");
      expect(stored).toMatchObject({ zoneId: 1429, position: { x: 42, y: 65 } });
    });
  });

  // Letting go puts the view back to where it was before the selection (map + zoom), unless the player moved it since.
  describe("letting go of a selection restores the view", { timeout: 20_000 }, () => {
    function renderInElwynn() {
      window.localStorage.setItem(
        PLAYER_SETTINGS_STORAGE_KEY,
        JSON.stringify({ faction: "A", classId: "warlock", zoneId: 1429, level: null, position: { x: 42, y: 65 } }),
      );
      renderPage();
    }

    const resetZoom = () => screen.queryByRole("button", { name: "Reset zoom" });

    /** Calder trains in Ironforge: selecting him opens Ironforge and zooms in on him. */
    async function selectCalder() {
      const find = await screen.findByRole("region", { name: "Find" });
      const calder = within(find).getByRole("article", { name: "Alexander Calder" });
      await userEvent.click(within(calder).getByRole("heading", { name: "Alexander Calder" }));
      expect(screen.getByRole("img", { name: "Ironforge map" })).toBeInTheDocument();
      expect(resetZoom()).toBeInTheDocument();
      return calder;
    }

    function expectBackInElwynnUnzoomed() {
      expect(screen.getByRole("img", { name: "Elwynn Forest map" })).toBeInTheDocument();
      expect(resetZoom()).not.toBeInTheDocument();
    }

    function clickMap() {
      // jsdom lays nothing out: give the map a box so the click lands on it.
      const box = { top: 0, left: 0, right: 600, bottom: 400, width: 600, height: 400, x: 0, y: 0 };
      const rectSpy = vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ ...box, toJSON: () => box });
      try {
        const map = screen.getByTestId("zone-map");
        fireEvent.pointerDown(map, { button: 0, clientX: 300, clientY: 200 });
        fireEvent.pointerUp(map, { button: 0, clientX: 300, clientY: 200 });
      } finally {
        rectSpy.mockRestore();
      }
    }

    const deselectPaths: [string, (calder: HTMLElement) => Promise<void> | void][] = [
      ["clicking the row again", (calder) => userEvent.click(within(calder).getByRole("heading", { name: "Alexander Calder" }))],
      ["the row's Clear button", (calder) => userEvent.click(within(calder).getByRole("button", { name: /Clear selection/ }))],
      [
        "Esc on the map",
        async () => {
          screen.getByTestId("zone-map").focus();
          await userEvent.keyboard("{Escape}");
        },
      ],
      [
        "Esc on the list",
        async (calder) => {
          calder.focus();
          await userEvent.keyboard("{Escape}");
        },
      ],
      ["a click on the map", () => clickMap()],
      ["Reset filters", () => userEvent.click(screen.getByRole("button", { name: "Reset filters" }))],
    ];

    it.each(deselectPaths)("%s returns to the map and zoom from before", async (_path, deselect) => {
      renderInElwynn();
      const calder = await selectCalder();
      await deselect(calder);
      expect(calder).not.toHaveAttribute("aria-current");
      expectBackInElwynnUnzoomed();
      // Still browsable afterwards: Esc on the map now zooms out.
      screen.getByTestId("zone-map").focus();
      await userEvent.keyboard("{Escape}");
      expect(screen.getByRole("img", { name: "Eastern Kingdoms map" })).toBeInTheDocument();
    });

    it("selecting A then B then letting go restores the view from before A", async () => {
      renderInElwynn();
      const calder = await selectCalder();
      const crowe = screen.getByRole("article", { name: "Warlock trainer: Maximillian Crowe" });
      await userEvent.click(within(crowe).getByRole("heading", { name: "Maximillian Crowe" }));
      expect(screen.getByRole("img", { name: "Elwynn Forest map" })).toBeInTheDocument();
      expect(resetZoom()).toBeInTheDocument();
      expect(calder).not.toHaveAttribute("aria-current");

      await userEvent.click(within(crowe).getByRole("button", { name: /Clear selection/ }));
      expect(crowe).not.toHaveAttribute("aria-current");
      expectBackInElwynnUnzoomed();
    });

    it("a zoomed-in view before the selection comes back zoomed in", async () => {
      renderInElwynn();
      await screen.findByRole("region", { name: "Find" });
      fireEvent.wheel(screen.getByTestId("zone-map"), { deltaY: -400, clientX: 10, clientY: 10 });
      expect(resetZoom()).toBeInTheDocument();
      const calder = await selectCalder();
      await userEvent.click(within(calder).getByRole("button", { name: /Clear selection/ }));
      expect(screen.getByRole("img", { name: "Elwynn Forest map" })).toBeInTheDocument();
      expect(resetZoom()).toBeInTheDocument();
    });

    it("after the player navigates the map themselves, letting go leaves the map where it is", async () => {
      renderInElwynn();
      const calder = await selectCalder();
      await userEvent.click(screen.getByRole("button", { name: "Zoom out" }));
      expect(screen.getByRole("img", { name: "Eastern Kingdoms map" })).toBeInTheDocument();
      await userEvent.click(within(calder).getByRole("button", { name: /Clear selection/ }));
      expect(calder).not.toHaveAttribute("aria-current");
      expect(screen.getByRole("img", { name: "Eastern Kingdoms map" })).toBeInTheDocument();
    });

    it("after the player zooms by hand, letting go leaves the map where it is", async () => {
      renderInElwynn();
      const calder = await selectCalder();
      await userEvent.click(screen.getByRole("button", { name: "Reset zoom" }));
      await userEvent.click(within(calder).getByRole("button", { name: /Clear selection/ }));
      expect(calder).not.toHaveAttribute("aria-current");
      expect(screen.getByRole("img", { name: "Ironforge map" })).toBeInTheDocument();
    });
  });

  it("Reset filters restores the finding filters and clears the selection, keeping the You section", async () => {
    window.localStorage.setItem(
      PLAYER_SETTINGS_STORAGE_KEY,
      JSON.stringify({ faction: "A", classId: "warlock", zoneId: 1429, level: 12, position: { x: 42, y: 65 } }),
    );
    renderPage();
    const find = await screen.findByRole("region", { name: "Find" });
    const reset = within(find).getByRole("button", { name: "Reset filters" });
    expect(reset).toBeDisabled();

    await userEvent.selectOptions(within(find).getByLabelText("What are you looking for?"), "flight_master");
    await userEvent.click(within(find).getByLabelText("Include the other faction"));
    await userEvent.click(screen.getByLabelText("Quest givers"));
    await userEvent.click(screen.getByRole("checkbox", { name: "Dungeons & raids" }));
    const trainer = screen.getByRole("article", { name: "Warlock trainer: Maximillian Crowe" });
    await userEvent.click(within(trainer).getByRole("heading", { name: "Maximillian Crowe" }));
    expect(reset).toBeEnabled();

    await userEvent.click(reset);
    expect(within(find).getByLabelText("What are you looking for?")).toHaveValue("class_trainer");
    expect(within(find).getByLabelText("Include the other faction")).not.toBeChecked();
    expect(within(find).getByLabelText("Show every class's trainers")).not.toBeChecked();
    expect(screen.getByLabelText("Quest givers")).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Dungeons & raids" })).toBeChecked();
    expect(trainer).not.toHaveAttribute("aria-current");
    expect(reset).toBeDisabled();
    // Who you are is not a filter.
    const stored = JSON.parse(window.localStorage.getItem(PLAYER_SETTINGS_STORAGE_KEY) ?? "{}");
    expect(stored).toMatchObject({ faction: "A", classId: "warlock", zoneId: 1429, level: 12, position: { x: 42, y: 65 } });
    expect(screen.getByLabelText("Zone")).toHaveDisplayValue("Elwynn Forest");
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
