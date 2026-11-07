import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import WowProfessionsPage from "@/games/wow-forever/pages/WowProfessionsPage";
import { CRAFT_SKILL_STORAGE_KEY } from "@/games/wow-forever/hooks/useCraftingSkill";
import { PLAYER_SETTINGS_STORAGE_KEY } from "@/games/wow-forever/hooks/usePlayerSettings";
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

async function skinNowCard() {
  return within(await screen.findByTestId("skin-now"));
}

function setPlayer(faction: PlayerFaction, level: number) {
  window.localStorage.setItem(PLAYER_SETTINGS_STORAGE_KEY, JSON.stringify({ faction, classId: "mage", zoneId: null, level, position: null }));
}

function zoneNames(): string[] {
  const zones = within(screen.getByRole("list", { name: "Where to go" }));
  return zones.getAllByRole("listitem").flatMap((li) => (li.dataset.zone ? [li.querySelector("p")?.firstChild?.textContent?.trim() ?? ""] : []));
}

describe("Skinning guide", () => {
  beforeEach(() => window.localStorage.clear());

  it("is in the picker's Gathering group and opens from ?p=skinning", async () => {
    renderAt("/wow-forever/professions?p=skinning");
    expect(screen.getByRole("radio", { name: "Skinning" })).toBeChecked();
    expect(screen.getByRole("heading", { name: "What can I skin right now?" })).toBeInTheDocument();
    expect(screen.getAllByText(/Junior Skinning Trainer/).length).toBeGreaterThan(0);
    expect(screen.getByText("No knife in your bags = you can't skin.")).toBeInTheDocument();
    expect(screen.getByText(/Pristine Leather, Pristine Hide and Pristine Scale/)).toBeInTheDocument();
    expect(screen.getByText(/Pelt Collecting for Beginners/)).toBeInTheDocument();
    expect(await screen.findByTestId("leather-table")).toBeInTheDocument();
  });

  it("skill 115 at level 18 skins beasts level 15–20", async () => {
    setPlayer(FACTION.alliance, 18);
    renderAt("/wow-forever/professions?p=skinning&skill=115");
    const card = await skinNowCard();
    expect(card.getByText("Skill 115, level 18 → skin beasts level 15–20")).toBeInTheDocument();
    expect(card.getByText(/up to level 23/)).toBeInTheDocument();
    expect(card.getByTestId("provenance-badge")).toHaveAttribute("data-provenance", "classic");
    expect(card.getByText(/Light Leather/)).toBeInTheDocument();
    const zones = within(screen.getByRole("list", { name: "Where to go" }));
    expect(zones.getAllByRole("link", { name: /Directions/ })[0]).toHaveAttribute("href", expect.stringMatching(/^\/wow-forever\/map\?to=pt%3A\d+/));
  });

  it("a new player starts in their own starting zones", async () => {
    setPlayer(FACTION.horde, 1);
    renderAt("/wow-forever/professions?p=skinning");
    expect((await skinNowCard()).getByText("Skill 1, level 1 → skin beasts level 1–3")).toBeInTheDocument();
    const names = zoneNames();
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) expect(["Durotar", "Mulgore", "Tirisfal Glades"]).toContain(name);
  });

  it("never sends you to the other faction's ground", async () => {
    setPlayer(FACTION.alliance, 15);
    renderAt("/wow-forever/professions?p=skinning&skill=75");
    await skinNowCard();
    const names = zoneNames();
    for (const hostile of ["Durotar", "Mulgore", "Tirisfal Glades", "The Barrens", "Silverpine Forest"]) expect(names).not.toContain(hostile);
  });

  it("at 75 the capped banner names a Horde trainer for Horde", async () => {
    setPlayer(FACTION.horde, 15);
    renderAt("/wow-forever/professions?p=skinning&skill=75");
    const banner = within(await screen.findByTestId("capped-banner"));
    expect(banner.getByText("You're capped at 75.")).toBeInTheDocument();
    expect(banner.getByText(/Train Journeyman at Thuwd/)).toBeInTheDocument();
  });

  it("remembers the Skinning skill apart from Mining's", async () => {
    renderAt("/wow-forever/professions?p=skinning");
    await userEvent.type(screen.getByRole("spinbutton", { name: "Your skill" }), "120");
    const stored = JSON.parse(window.localStorage.getItem(CRAFT_SKILL_STORAGE_KEY) ?? "{}");
    expect(stored).toEqual({ skinning: 120 });
  });

  it("never states a tagging rule or gathering perks", async () => {
    const { container } = renderAt("/wow-forever/professions?p=skinning");
    await skinNowCard();
    expect(container.textContent).not.toMatch(/tag|your own kill|Bountiful Harvest|Legacy/i);
  });
});
