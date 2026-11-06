import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import sourcesJson from "@/games/wow-forever/data/professions/crafting/classic/sources.json";
import { HERBALISM_NODES } from "@/games/wow-forever/data/professions/gathering/herbalism";
import { HERBALISM_TRAINERS } from "@/games/wow-forever/data/professions/gathering/herbalismTrainers";
import { createSourceLookup, type RawSourcesFile } from "@/games/wow-forever/data/sourceDecode";
import { nearestTrainer } from "@/games/wow-forever/gathering/nearestTrainer";
import { resolveNodes } from "@/games/wow-forever/gathering/resolveNodes";
import { CRAFT_SKILL_STORAGE_KEY } from "@/games/wow-forever/hooks/useCraftingSkill";
import { PLAYER_SETTINGS_STORAGE_KEY } from "@/games/wow-forever/hooks/usePlayerSettings";
import WowProfessionsPage from "@/games/wow-forever/pages/WowProfessionsPage";
import { FACTION, type PlayerFaction } from "@/games/wow-forever/types/worldMap";

vi.mock("@/games/wow-forever/api/wowPricesApi", async () => {
  const stub = await import("@/test/auctionPricesStub");
  return { useGetWowPricesQuery: () => stub.pricesLoading() };
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <WowProfessionsPage />
    </MemoryRouter>,
  );
}

async function gatherNowCard() {
  return within(await screen.findByTestId("gather-now"));
}

function setPlayer(faction: PlayerFaction, level: number) {
  window.localStorage.setItem(PLAYER_SETTINGS_STORAGE_KEY, JSON.stringify({ faction, classId: "warlock", level }));
}

describe("Herbalism data", () => {
  const lookup = createSourceLookup(sourcesJson as unknown as RawSourcesFile);

  it("every herb has spawns carrying an Herbalism Lock skill, and the list runs lowest skill first", () => {
    const resolved = resolveNodes(HERBALISM_NODES, (id) => lookup.reagent(id));
    expect(resolved.every((r) => r.spots.some((s) => s.gather?.skill === "herbalism"))).toBe(true);
    const skills = resolved.map((r) => r.thresholds.orange);
    expect(skills).toEqual([...skills].sort((a, b) => a - b));
    expect(skills[0]).toBe(1);
    expect(skills[skills.length - 1]).toBe(300);
  });

  it("has no trainer in Tanaris or Searing Gorge — the reason to learn Artisan first", () => {
    const all = [...Object.values(HERBALISM_TRAINERS.cities).flat().map((c) => c.npc), ...Object.values(HERBALISM_TRAINERS.towns).flat()];
    expect(all.some((t) => /Tanaris|Searing Gorge/.test(t.where))).toBe(false);
  });

  it("sends you to the trainer in your zone, else your capital's", () => {
    expect(nearestTrainer(HERBALISM_TRAINERS, FACTION.alliance, "Loch Modan").name).toBe("Kali Healtouch");
    expect(nearestTrainer(HERBALISM_TRAINERS, FACTION.horde, "Feralas").name).toBe("Ruw");
    expect(nearestTrainer(HERBALISM_TRAINERS, FACTION.horde, null).name).toBe("Jandi");
  });
});

describe("Herbalism guide", () => {
  beforeEach(() => window.localStorage.clear());

  it("is in the picker's Gathering group and opens from ?p=herbalism", async () => {
    renderAt("/wow-forever/professions?p=herbalism");
    expect(screen.getByRole("radio", { name: "Herbalism" })).toBeChecked();
    expect(screen.getByRole("heading", { name: "What can I pick right now?" })).toBeInTheDocument();
    expect(screen.getAllByText(/Junior Herbalism Trainer/).length).toBeGreaterThan(0);
    expect(screen.getByText("/cast Find Herbs")).toBeInTheDocument();
    expect(screen.getByText("Learn Artisan before Tanaris or Searing Gorge")).toBeInTheDocument();
    expect(screen.getByText(/healing potions are First Aid now/i)).toBeInTheDocument();
    expect(await screen.findByTestId("node-table")).toHaveTextContent("Black Lotus");
    expect(screen.queryByTestId("gathering-crafts")).not.toBeInTheDocument();
  });

  it("with no skill, starts you on Peacebloom and Silverleaf with Earthroot next", async () => {
    renderAt("/wow-forever/professions?p=herbalism");
    const card = await gatherNowCard();
    expect(card.getByText("Peacebloom")).toBeInTheDocument();
    expect(card.getByText("Silverleaf")).toBeInTheDocument();
    expect(card.getByText(/Next unlock:/)).toHaveTextContent("Next unlock: Earthroot at 15");
  });

  it("at 75 the banner says to train Journeyman at a trainer on your side", async () => {
    renderAt("/wow-forever/professions?p=herbalism&skill=75");
    const banner = await screen.findByTestId("capped-banner");
    expect(within(banner).getByText("You're capped at 75.")).toBeInTheDocument();
    expect(banner).toHaveTextContent("Train Journeyman at Tannysa");
    await userEvent.click(screen.getByRole("radio", { name: "Horde" }));
    expect(await screen.findByTestId("capped-banner")).toHaveTextContent("Train Journeyman at Jandi");
  });

  it("at 260 lists Golden Sansam with Dreamfoil next, and zones with Directions", async () => {
    setPlayer(FACTION.alliance, 52);
    renderAt("/wow-forever/professions?p=herbalism&skill=260");
    const card = await gatherNowCard();
    expect(card.getByText("Golden Sansam")).toBeInTheDocument();
    expect(card.getByText(/Next unlock:/)).toHaveTextContent("Dreamfoil at 270");
    const zones = within(screen.getByRole("list", { name: "Where to go" }));
    expect(zones.getAllByRole("link", { name: /Directions/ })[0]).toHaveAttribute("href", expect.stringMatching(/^\/wow-forever\/map\?to=pt%3A\d+/));
  });

  it("remembers the Herbalism skill apart from Mining's", async () => {
    window.localStorage.setItem(CRAFT_SKILL_STORAGE_KEY, JSON.stringify({ mining: 200 }));
    renderAt("/wow-forever/professions?p=herbalism");
    const input = screen.getByRole("spinbutton", { name: "Your skill" });
    expect(input).toHaveValue(null);
    await userEvent.type(input, "120");
    const stored = JSON.parse(window.localStorage.getItem(CRAFT_SKILL_STORAGE_KEY) ?? "{}");
    expect(stored).toEqual({ mining: 200, herbalism: 120 });
  });
});
