import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import WowGoldPage from "@/games/wow-forever/pages/WowGoldPage";
import { GOLD_CHECKLIST_STORAGE_KEY } from "@/games/wow-forever/components/gold/GoldDontDoSection";
import { WOW_CLASSES } from "@/games/wow-forever/data/classes";
import { BAND_TIPS, CLASS_GOLD_TIPS, GOLD_DONT_DO, SELL_ITEMS, VENDOR_ITEMS } from "@/games/wow-forever/data/gold/goldTips";
import {
  clothPerHour,
  FARM_SORT,
  farmsFor,
  formatMoney,
  goldFarms,
  goldPerHour,
} from "@/games/wow-forever/gold/goldFarms";
import { CHECKLIST_STORAGE_KEY } from "@/games/wow-forever/hooks/useChecklist";
import { PLAYER_SETTINGS_STORAGE_KEY } from "@/games/wow-forever/hooks/usePlayerSettings";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <WowGoldPage />
    </MemoryRouter>,
  );
}

function section(id: string) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`no ${id} section`);
  return within(el);
}

function savePlayer(level: number | null, classId: string) {
  window.localStorage.setItem(
    PLAYER_SETTINGS_STORAGE_KEY,
    JSON.stringify({ faction: "A", classId, zoneId: null, level, position: null }),
  );
}

describe("goldFarms", () => {
  const farms = goldFarms();

  it("formats copper the way the game does", () => {
    expect(formatMoney(45)).toBe("45c");
    expect(formatMoney(320)).toBe("3s 20c");
    expect(formatMoney(300)).toBe("3s");
    expect(formatMoney(124_049)).toBe("12g 40s");
    expect(formatMoney(19_999)).toBe("2g");
  });

  it("puts mobs from 3 under to 1 over your level, one per place, best first", () => {
    for (const level of [5, 15, 30, 45, 58]) {
      const shown = farmsFor(farms, level, { skinning: false, sort: FARM_SORT.gold });
      expect(shown.length).toBeGreaterThanOrEqual(3);
      for (const f of shown) {
        expect(f.maxLevel).toBeGreaterThanOrEqual(level - 3);
        expect(f.minLevel).toBeLessThanOrEqual(level + 1);
      }
      const places = shown.map((f) => `${f.zoneId}:${f.subzone || f.npcId}`);
      expect(new Set(places).size).toBe(places.length);
      const gold = shown.map((f) => goldPerHour(f, false));
      expect([...gold].sort((a, b) => b - a)).toEqual(gold);
    }
  });

  it("finds Runecloth camps at 58 when sorted by cloth", () => {
    const shown = farmsFor(farms, 58, { skinning: false, sort: FARM_SORT.cloth });
    expect(shown[0].cloth).toBe("Runecloth");
    expect(clothPerHour(shown[0])).toBeGreaterThan(20);
  });

  it("counts Skinning only when you have it", () => {
    const beast = farms.find((f) => f.skinVendor > 0);
    if (!beast) throw new Error("no skinnable farm");
    expect(goldPerHour(beast, true)).toBeGreaterThan(goldPerHour(beast, false));
  });
});

/** These tests pick levels past the beta cap: run them after launch. */
const AFTER_LAUNCH = new Date("2026-11-05T12:00:00Z");
const IN_BETA = new Date("2026-10-05T12:00:00Z");

function at(date: Date) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(date);
}

describe("Making gold page", () => {
  beforeEach(() => {
    window.localStorage.clear();
    at(AFTER_LAUNCH);
  });
  afterEach(() => vi.useRealTimers());

  it("in the beta, reads a saved level past 30 as 30", () => {
    at(IN_BETA);
    savePlayer(45, "warlock");
    renderAt("/wow-forever/gold");
    expect(screen.getByLabelText("Your level")).toHaveValue(30);
    expect(screen.getByText(/The beta stops at level 30/)).toBeInTheDocument();
  });

  it("starts at the 1–20 plan, says the numbers are vendor prices, and asks for a level to list farms", () => {
    renderAt("/wow-forever/gold");
    expect(screen.getByRole("heading", { name: "Making gold" })).toBeInTheDocument();
    expect(screen.getByText(/vendor prices from Classic's loot tables/)).toBeInTheDocument();
    expect(section("now").getByText("Quest, and loot every mob you kill")).toBeInTheDocument();
    expect(section("farm").getByText(/Enter your level/)).toBeInTheDocument();
  });

  it("uses the saved level for the plan and the farm list, and saves a new one", async () => {
    savePlayer(45, "mage");
    renderAt("/wow-forever/gold");
    expect(section("now").getByRole("heading", { name: "Your plan for levels 40–60" })).toBeInTheDocument();
    expect(section("farm").getAllByRole("link", { name: "Directions on the World Map" }).length).toBeGreaterThanOrEqual(3);
    const level = screen.getByLabelText("Your level");
    await userEvent.clear(level);
    await userEvent.type(level, "25");
    expect(section("now").getByRole("heading", { name: "Your plan for levels 20–40" })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(PLAYER_SETTINGS_STORAGE_KEY) ?? "{}")).toMatchObject({ level: 25 });
  });

  it("re-sorts the farm list by cloth and adds Skinning to gold an hour", async () => {
    savePlayer(58, "warlock");
    renderAt("/wow-forever/gold");
    const farm = section("farm");
    expect(farm.getAllByText(/Skinnable:/).length).toBeGreaterThan(0);
    await userEvent.click(farm.getByLabelText("I have Skinning"));
    expect(farm.queryByText(/Skinnable:/)).not.toBeInTheDocument();
    await userEvent.click(farm.getByRole("radio", { name: "Most cloth" }));
    expect(farm.getAllByText(/Runecloth/).length).toBeGreaterThan(0);
  });

  it("shows tips for the saved class, or every class", async () => {
    savePlayer(null, "rogue");
    renderAt("/wow-forever/gold");
    expect(section("class").getByText("Pick pockets before you kill")).toBeInTheDocument();
    expect(section("class").queryByText("Sell portals")).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Class"), "all");
    expect(section("class").getByText("Sell portals")).toBeInTheDocument();
  });

  it("saves a picked class as yours, shared with the World Map", async () => {
    savePlayer(20, "mage");
    renderAt("/wow-forever/gold");
    expect(screen.getByLabelText("Class")).toHaveValue("mage");
    await userEvent.selectOptions(screen.getByLabelText("Class"), "warlock");
    expect(section("class").getByText("Summon players for tips")).toBeInTheDocument();
    expect(section("class").queryByText("Sell portals")).not.toBeInTheDocument();
    const saved = JSON.parse(localStorage.getItem(PLAYER_SETTINGS_STORAGE_KEY) ?? "{}");
    expect(saved).toMatchObject({ classId: "warlock", level: 20 });
  });

  it("marks Forever-only and unknown tips", () => {
    savePlayer(25, "mage");
    renderAt("/wow-forever/gold");
    const now = section("now");
    expect(now.getByText("Unconfirmed")).toBeInTheDocument();
  });

  it("saves the checklist separately from the New Player Guide's", async () => {
    renderAt("/wow-forever/gold");
    await userEvent.click(section("dont").getByLabelText(/Don't buy gold/));
    expect(section("dont").getByText(`1 of ${GOLD_DONT_DO.length} done`)).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(GOLD_CHECKLIST_STORAGE_KEY) ?? "[]")).toEqual(["no-buying-gold"]);
    expect(window.localStorage.getItem(CHECKLIST_STORAGE_KEY)).toBeNull();
  });

  it("has well-formed data", () => {
    const ids = [
      ...BAND_TIPS.flatMap((b) => [...b.top, ...b.more]),
      ...CLASS_GOLD_TIPS.flatMap((c) => c.tips),
      ...SELL_ITEMS,
      ...VENDOR_ITEMS,
    ].map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const b of BAND_TIPS) expect(b.top).toHaveLength(3);
    expect(new Set(CLASS_GOLD_TIPS.map((c) => c.classId))).toEqual(new Set(WOW_CLASSES.map((c) => c.id)));
    // No prices before launch.
    const text = JSON.stringify([BAND_TIPS, CLASS_GOLD_TIPS, SELL_ITEMS, VENDOR_ITEMS, GOLD_DONT_DO]);
    expect(text).not.toMatch(/\d+\s*(g|gold|s|silver)\b/i);
  });
});
