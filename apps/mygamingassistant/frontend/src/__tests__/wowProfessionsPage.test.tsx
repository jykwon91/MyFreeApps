import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import WowProfessionsPage from "@/games/wow-forever/pages/WowProfessionsPage";
import { COOKING_ROUTE } from "@/games/wow-forever/data/professions/cooking";
import { FISHING_ROUTE } from "@/games/wow-forever/data/professions/fishing";
import { CITY_TRAINERS } from "@/games/wow-forever/data/professions/trainers";
import { PLAYER_SETTINGS_STORAGE_KEY } from "@/games/wow-forever/hooks/usePlayerSettings";
import { CRAFT_SKILL_STORAGE_KEY } from "@/games/wow-forever/hooks/useCraftingSkill";

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
    expect(route().getByText(/Wulan/)).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(PLAYER_SETTINGS_STORAGE_KEY) ?? "{}").faction).toBe("H");
  });

  it("uses one caption instead of a chip per row when most of the route is unconfirmed", async () => {
    renderAt("/wow-forever/professions?p=fishing");
    expect(route().getByText(/mostly the Classic route/)).toBeInTheDocument();
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
    expect(within(soulDust).getByText(/Disenchant is a spell in your spellbook/)).toBeInTheDocument();
    expect(shopping.getByText(/Open an item to see where to get it/)).toBeInTheDocument();

    const rowRod = route().getAllByText("1× Copper Rod")[0].closest("details") as HTMLDetailsElement;
    await user.click(within(rowRod).getByText("1× Copper Rod"));
    expect(rowRod.open).toBe(true);
    expect(within(rowRod).getByText("Sold by")).toBeInTheDocument();
    expect(within(rowRod).queryByText(/ask a player with Blacksmithing/)).not.toBeInTheDocument();
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
