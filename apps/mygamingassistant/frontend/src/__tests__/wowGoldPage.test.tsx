import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import WowGoldPage from "@/games/wow-forever/pages/WowGoldPage";
import { GOLD_CHECKLIST_STORAGE_KEY } from "@/games/wow-forever/components/gold/GoldDontDoSection";
import { WOW_CLASSES } from "@/games/wow-forever/data/classes";
import { BAND_TIPS, CLASS_GOLD_TIPS, GOLD_DONT_DO, SELL_ITEMS, VENDOR_ITEMS } from "@/games/wow-forever/data/gold/goldTips";
import { bandForLevel, parseBand } from "@/games/wow-forever/hooks/useGoldBand";
import { CHECKLIST_STORAGE_KEY } from "@/games/wow-forever/hooks/useChecklist";
import { PLAYER_SETTINGS_STORAGE_KEY } from "@/games/wow-forever/hooks/usePlayerSettings";

function LocationProbe() {
  const location = useLocation();
  return <p data-testid="search">{location.search}</p>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <WowGoldPage />
      <LocationProbe />
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

describe("bandForLevel / parseBand", () => {
  it("maps a level to its band, starting at 1–20 with no level", () => {
    expect(bandForLevel(null)).toBe("1-20");
    expect(bandForLevel(19)).toBe("1-20");
    expect(bandForLevel(20)).toBe("20-40");
    expect(bandForLevel(39)).toBe("20-40");
    expect(bandForLevel(60)).toBe("40-60");
  });

  it("accepts only known bands", () => {
    expect(parseBand("all")).toBe("all");
    expect(parseBand("40-60")).toBe("40-60");
    expect(parseBand("70-80")).toBeNull();
    expect(parseBand(null)).toBeNull();
  });
});

describe("Making gold page", () => {
  beforeEach(() => window.localStorage.clear());

  it("starts at 1–20 with three numbered tips and says there are no prices", () => {
    renderAt("/wow-forever/gold");
    expect(screen.getByRole("heading", { name: "Making gold" })).toBeInTheDocument();
    expect(screen.getByText(/No prices here/)).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "1–20" })).toBeChecked();
    expect(section("now").getByText("Take two gathering professions")).toBeInTheDocument();
  });

  it("seeds the band from the saved level and lets ?band= win", () => {
    savePlayer(45, "mage");
    const { unmount } = renderAt("/wow-forever/gold");
    expect(screen.getByRole("radio", { name: "40–60" })).toBeChecked();
    expect(section("now").getByText("Farm high-end materials")).toBeInTheDocument();
    unmount();
    renderAt("/wow-forever/gold?band=20-40");
    expect(screen.getByRole("radio", { name: "20–40" })).toBeChecked();
  });

  it("puts the band in the URL and shows every band for All", async () => {
    renderAt("/wow-forever/gold");
    await userEvent.click(screen.getByRole("radio", { name: "All" }));
    expect(screen.getByTestId("search")).toHaveTextContent("band=all");
    for (const b of BAND_TIPS) expect(section("now").getByRole("heading", { name: b.label })).toBeInTheDocument();
  });

  it("shows tips for the saved class, or every class", async () => {
    savePlayer(null, "rogue");
    renderAt("/wow-forever/gold");
    expect(section("class").getByText("Pick pockets before you kill")).toBeInTheDocument();
    expect(section("class").queryByText("Sell portals")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "All classes" }));
    expect(section("class").getByText("Sell portals")).toBeInTheDocument();
  });

  it("marks Forever-only and unknown tips", () => {
    renderAt("/wow-forever/gold?band=20-40");
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
