import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import WowProfessionsPage from "@/games/wow-forever/pages/WowProfessionsPage";
import { CRAFT_SKILL_STORAGE_KEY } from "@/games/wow-forever/hooks/useCraftingSkill";
import { PLAYER_SETTINGS_STORAGE_KEY } from "@/games/wow-forever/hooks/usePlayerSettings";
import { FACTION, type PlayerFaction } from "@/games/wow-forever/types/worldMap";
import { iconSources } from "./wowIconFiles";

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
  window.localStorage.setItem(PLAYER_SETTINGS_STORAGE_KEY, JSON.stringify({ faction, level }));
}

describe("Mining guide", () => {
  beforeEach(() => window.localStorage.clear());

  it("is in the picker's Gathering group and opens from ?p=mining", async () => {
    renderAt("/wow-forever/professions?p=mining");
    expect(screen.getByRole("radio", { name: "Mining" })).toBeChecked();
    expect(screen.getByRole("heading", { name: "What can I mine right now?" })).toBeInTheDocument();
    expect(screen.getAllByText(/Junior Mining Trainer/).length).toBeGreaterThan(0);
    expect(screen.getByText("/cast Find Minerals")).toBeInTheDocument();
    expect(await screen.findByTestId("node-table")).toBeInTheDocument();
  });

  it("with no skill, starts you on Copper with Tin next", async () => {
    renderAt("/wow-forever/professions?p=mining");
    const card = await gatherNowCard();
    expect(card.getByText("Copper Vein")).toBeInTheDocument();
    expect(card.getByText(/Next unlock:/)).toHaveTextContent("Next unlock: Tin at 65");
    expect(screen.queryByTestId("capped-banner")).not.toBeInTheDocument();
  });

  it("at 74 there's no capped banner; at 75 it says to train Journeyman", async () => {
    const { unmount } = renderAt("/wow-forever/professions?p=mining&skill=74");
    await gatherNowCard();
    expect(screen.queryByTestId("capped-banner")).not.toBeInTheDocument();
    unmount();
    renderAt("/wow-forever/professions?p=mining&skill=75");
    const banner = within(await screen.findByTestId("capped-banner"));
    expect(banner.getByText("You're capped at 75.")).toBeInTheDocument();
    expect(banner.getByText(/Train Journeyman at .*the Junior trainer can't teach it\./)).toBeInTheDocument();
  });

  it("at 150 the banner asks for Expert and Iron is on the list", async () => {
    renderAt("/wow-forever/professions?p=mining&skill=150");
    expect(within(await screen.findByTestId("capped-banner")).getByText(/Train Expert/)).toBeInTheDocument();
    expect((await gatherNowCard()).getByText("Iron Deposit")).toBeInTheDocument();
  });

  it("at 260 lists Small Thorium with Rich Thorium next, and zones with Directions", async () => {
    setPlayer(FACTION.horde, 55);
    renderAt("/wow-forever/professions?p=mining&skill=260");
    const card = await gatherNowCard();
    expect(card.getByText("Small Thorium Vein")).toBeInTheDocument();
    expect(card.getByText(/Next unlock:/)).toHaveTextContent("Rich Thorium at 275");
    const zones = within(screen.getByRole("list", { name: "Where to go" }));
    expect(zones.getAllByRole("listitem").length).toBeGreaterThan(0);
    expect(zones.getAllByRole("link", { name: /Directions/ })[0]).toHaveAttribute("href", expect.stringMatching(/^\/wow-forever\/map\?to=pt%3A\d+/));
  });

  it("never sends you to the other faction's ground", async () => {
    setPlayer(FACTION.alliance, 5);
    renderAt("/wow-forever/professions?p=mining&skill=1");
    await gatherNowCard();
    const zones = within(screen.getByRole("list", { name: "Where to go" }));
    expect(zones.queryByText("Durotar")).not.toBeInTheDocument();
    expect(zones.queryByText("Mulgore")).not.toBeInTheDocument();
  });

  it("remembers the Mining skill apart from Cooking's", async () => {
    renderAt("/wow-forever/professions?p=mining");
    const input = screen.getByRole("spinbutton", { name: "Your skill" });
    await userEvent.type(input, "120");
    const stored = JSON.parse(window.localStorage.getItem(CRAFT_SKILL_STORAGE_KEY) ?? "{}");
    expect(stored.mining).toBe(120);
  });

  it("keeps the smelting list collapsed with the forge note from the client", async () => {
    renderAt("/wow-forever/professions?p=mining");
    const crafts = within(await screen.findByTestId("gathering-crafts"));
    expect(crafts.getByText("Smelting")).toBeInTheDocument();
    expect(crafts.getAllByText(/at a .*Forge/).length).toBeGreaterThan(0);
    const azerothium = within(crafts.getByText("Smelt Azerothium").closest("li") as HTMLElement);
    expect(azerothium.getByText(/Source unknown/)).toBeInTheDocument();
    expect(azerothium.queryByText(/learn at/)).toBeNull();
    const tin = within(crafts.getByText("Smelt Tin").closest("li") as HTMLElement);
    expect(tin.getByText(/learn at 50/)).toBeInTheDocument();
  });
});

describe("Mining guide icons", () => {
  beforeEach(() => window.localStorage.clear());

  it("shows the ore's icon on the node you can mine now", async () => {
    renderAt("/wow-forever/professions?p=mining");
    const card = await gatherNowCard();
    expect(card.getAllByTestId("game-icon").length).toBeGreaterThan(0);
    expect(iconSources(await screen.findByTestId("node-table")).length).toBeGreaterThan(0);
  });
});
