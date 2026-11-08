import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import WowProfessionsPage from "@/games/wow-forever/pages/WowProfessionsPage";
import { COOKING_ROUTE } from "@/games/wow-forever/data/professions/cooking";
import { FISHING_ROUTE } from "@/games/wow-forever/data/professions/fishing";
import { CITY_TRAINERS } from "@/games/wow-forever/data/professions/trainers";
import { PLAYER_SETTINGS_STORAGE_KEY } from "@/games/wow-forever/hooks/usePlayerSettings";
import { CRAFT_SKILL_STORAGE_KEY } from "@/games/wow-forever/hooks/useCraftingSkill";
import { PROVENANCE_LABEL } from "@/games/wow-forever/data/provenance/provenanceLabels";

// Auction prices come from the API; these tests don't look at them, so they stay loading.
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

function route() {
  const section = document.getElementById("route");
  if (!section) throw new Error("no route section");
  return within(section);
}

describe("Professions page", () => {
  beforeEach(() => window.localStorage.clear());

  it("defaults to Cooking and leads with training", () => {
    renderAt("/wow-forever/professions");
    expect(screen.getByRole("radio", { name: "Cooking" })).toBeChecked();
    expect(screen.getByRole("heading", { name: /train it first/i })).toBeInTheDocument();
    expect(screen.getByText("Stephen Ryback")).toBeInTheDocument();
    expect(route().getByText("Spiced Wolf Meat")).toBeInTheDocument();
  });

  it("opens Fishing from ?p=fishing and falls back to Cooking for anything else", () => {
    const { unmount } = renderAt("/wow-forever/professions?p=fishing");
    expect(screen.getByRole("radio", { name: "Fishing" })).toBeChecked();
    expect(screen.getByText("Arnold Leland")).toBeInTheDocument();
    expect(screen.getByText(/You haven't trained Fishing yet/)).toBeInTheDocument();
    unmount();
    renderAt("/wow-forever/professions?p=nonsense");
    expect(screen.getByRole("radio", { name: "Cooking" })).toBeChecked();
  });

  it("switches profession with the toggle", async () => {
    renderAt("/wow-forever/professions");
    await userEvent.click(screen.getByRole("radio", { name: "Fishing" }));
    expect(route().getByText("Artisan quest: Nat Pagle, Angler Extreme")).toBeInTheDocument();
  });

  it("shows only the chosen faction's trainers and remembers the faction", async () => {
    renderAt("/wow-forever/professions");
    expect(screen.queryByText("Zamja")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "Horde" }));
    expect(screen.getByText("Zamja")).toBeInTheDocument();
    expect(screen.queryByText("Stephen Ryback")).not.toBeInTheDocument();
    expect(route().getByText(/from Wulan in Shadowprey Village/)).toBeInTheDocument();
    const book = route().getAllByTestId("recipe-buy-line").filter((li) => li.textContent?.includes("Expert Cookbook"));
    expect(book).toHaveLength(1);
    expect(book[0]).toHaveTextContent(/Buy Expert Cookbook from Wulan/);
    expect(JSON.parse(window.localStorage.getItem(PLAYER_SETTINGS_STORAGE_KEY) ?? "{}").faction).toBe("H");
  });

  it("uses one caption instead of a chip per row when most of the route is unconfirmed", async () => {
    renderAt("/wow-forever/professions?p=fishing");
    expect(route().getByTestId("route-provenance")).toHaveTextContent(`Most of this route: ${PROVENANCE_LABEL.classic}`);
    expect(route().queryByText("Unconfirmed")).not.toBeInTheDocument();
  });

  it("has well-formed data", () => {
    for (const steps of [COOKING_ROUTE, FISHING_ROUTE]) {
      expect(new Set(steps.map((s) => `${s.skill}-${s.name}`)).size).toBe(steps.length);
      expect(steps.some((s) => s.kind === "milestone")).toBe(true);
    }
    for (const faction of ["A", "H"]) {
      expect(CITY_TRAINERS.filter((c) => c.faction === faction)).toHaveLength(3);
    }
  });

  it("opens Tailoring from ?p=tailoring with its trainers, route and shopping list", async () => {
    renderAt("/wow-forever/professions?p=tailoring");
    expect(screen.getByRole("radio", { name: "Tailoring" })).toBeChecked();
    expect(screen.getByRole("heading", { name: "Professions" })).toBeInTheDocument();
    expect(screen.getByText("Georgio Bolero")).toBeInTheDocument();
    await screen.findByRole("heading", { name: "Leveling route" });
    expect(route().getAllByText("Bolt of Linen Cloth").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Shopping list" })).toBeInTheDocument();
    expect(screen.getByText(/Forever adds 180 Tailoring recipes/)).toBeInTheDocument();
  });

  it("opens First Aid from ?p=firstaid under Secondary, with the Expert book and the Triage quest on its route", async () => {
    renderAt("/wow-forever/professions?p=firstaid");
    expect(screen.getByRole("radio", { name: "First Aid" })).toBeChecked();
    expect(screen.getByText("Shaina Fuller")).toBeInTheDocument();
    await screen.findByRole("heading", { name: "Leveling route" });
    expect(route().getAllByText("Linen Bandage").length).toBeGreaterThan(0);
    expect(route().getByText(/At 125: learn Expert First Aid/)).toBeInTheDocument();
    // The book's vendor also sells the Heavy Silk and Mageweave manuals, so later rows link to her too.
    expect(route().getAllByRole("link", { name: "Directions to Deneb Walker" })[0]).toHaveAttribute("href", "/wow-forever/map?to=npc:2805&dir=1");
    expect(route().getByText(/At 225: earn Artisan First Aid/)).toBeInTheDocument();
    expect(route().getByRole("link", { name: "Directions to Doctor Gustaf VanHowzen" })).toBeInTheDocument();
    expect(route().getByText(/boat from Menethil Harbor/)).toBeInTheDocument();
    expect(screen.getByText(/Healing potions moved from Alchemy to First Aid/)).toBeInTheDocument();
  });

  it("says where to get each material, in the shopping list and on the route rows", async () => {
    const user = userEvent.setup();
    renderAt("/wow-forever/professions?p=enchanting");
    await screen.findByRole("heading", { name: "Leveling route" });
    const shopping = within(document.getElementById("shopping") as HTMLElement);
    const soulDust = document.querySelector('#shopping details[data-mat="11083"]') as HTMLDetailsElement;
    expect(within(soulDust).getByText("Disenchant level 21–30 green armor")).toBeInTheDocument();
    await user.click(within(soulDust).getByText("Soul Dust"));
    expect(soulDust.open).toBe(true);
    expect(within(soulDust).getByText(/^Disenchant green armor for level 21–30 \(about 75% each\)\./)).toBeInTheDocument();
    expect(within(soulDust).getByText(/press K, drag Disenchant from the main tab/)).toBeInTheDocument();
    expect(shopping.getByText(/Open an item to see where to get it/)).toBeInTheDocument();

    const rowRod = route().getAllByText("1× Copper Rod")[0].closest("details") as HTMLDetailsElement;
    await user.click(within(rowRod).getByText("1× Copper Rod"));
    expect(rowRod.open).toBe(true);
    expect(within(rowRod).getByText("Sold by")).toBeInTheDocument();
    expect(within(rowRod).queryByText(/ask a player with Blacksmithing/)).not.toBeInTheDocument();
  });

  it("says where to get each material right in the route row, for crafting and Cooking", async () => {
    const user = userEvent.setup();
    const { unmount } = renderAt("/wow-forever/professions?p=tailoring");
    await screen.findByRole("heading", { name: "Leveling route" });
    const COARSE_THREAD = 2320;
    const thread = document.querySelector(`[aria-label^="Materials in all"] [data-mat="${COARSE_THREAD}"]`) as HTMLElement;
    expect(within(thread).getByText("Sold in most towns")).toBeInTheDocument();
    // A step made many times says how many of each material it takes in all.
    expect(within(thread).getByText(/^\d+×$/)).toBeInTheDocument();
    expect(within(thread).getByText(/· 1 per craft/)).toBeInTheDocument();
    unmount();

    renderAt("/wow-forever/professions?p=cooking");
    const spices = route().getAllByText("Mild Spices")[0].closest("details") as HTMLDetailsElement;
    expect(within(spices).getByText("Sold in most towns")).toBeInTheDocument();
    await user.click(within(spices).getByText("Mild Spices"));
    expect(spices.open).toBe(true);
    expect(within(spices).getByText("Sold by")).toBeInTheDocument();
  });

  it("says when to disenchant and when to sell, for Enchanting only", async () => {
    const { unmount } = renderAt("/wow-forever/professions?p=enchanting");
    const section = within(screen.getByRole("region", { name: "Disenchant or sell?" }));
    expect(screen.getByRole("link", { name: "Disenchant or sell?" })).toHaveAttribute("href", "#disenchant");
    const gray = document.querySelector('[data-rule="gray-white"]') as HTMLElement;
    expect(within(gray).getByText("Vendor it")).toBeInTheDocument();
    const monkey = document.querySelector('[data-rule="stat-green"]') as HTMLElement;
    expect(within(monkey).getByText(/^Green weapon, or green “of the Monkey”/)).toBeInTheDocument();
    expect(within(monkey).getByText("Check the price first")).toBeInTheDocument();
    expect(section.getByText(/Disenchant weapons/)).toBeInTheDocument();
    unmount();

    renderAt("/wow-forever/professions?p=tailoring");
    expect(screen.queryByRole("region", { name: "Disenchant or sell?" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Disenchant or sell?" })).not.toBeInTheDocument();
  });

  it("points at your row for ?skill= without overwriting the saved skill", async () => {
    window.localStorage.setItem(CRAFT_SKILL_STORAGE_KEY, JSON.stringify({ enchanting: 10 }));
    renderAt("/wow-forever/professions?p=enchanting&skill=120");
    await screen.findByRole("heading", { name: "Leveling route" });
    expect(route().getByText("You are here")).toBeInTheDocument();
    const current = document.querySelector('[aria-current="step"]');
    expect(current).not.toBeNull();
    expect(screen.getByRole("button", { name: "Jump to my step" })).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(CRAFT_SKILL_STORAGE_KEY) ?? "{}").enchanting).toBe(10);
  });

  it("saves a typed skill per profession", async () => {
    renderAt("/wow-forever/professions?p=enchanting");
    const input = await screen.findByLabelText("Your skill");
    expect(route().queryByText("You are here")).not.toBeInTheDocument();
    await userEvent.type(input, "120");
    expect(await route().findByText("You are here")).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(CRAFT_SKILL_STORAGE_KEY) ?? "{}").enchanting).toBe(120);
  });
});
