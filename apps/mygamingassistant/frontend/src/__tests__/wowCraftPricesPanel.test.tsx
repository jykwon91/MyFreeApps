import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import CraftRouteSections from "@/games/wow-forever/components/crafting/CraftRouteSections";
import sourcesJson from "@/games/wow-forever/data/professions/crafting/classic/sources.json";
import enchantingJson from "@/games/wow-forever/data/professions/crafting/enchanting.json";
import trainerSkillsJson from "@/games/wow-forever/data/professions/crafting/classic/trainerSkills.json";
import { createSourceLookup, type RawSourcesFile } from "@/games/wow-forever/data/sourceDecode";
import type { CraftingData } from "@/games/wow-forever/hooks/useCraftingData";
import { PRICES_STORAGE_KEY } from "@/games/wow-forever/hooks/useCraftPrices";
import { FACTION } from "@/games/wow-forever/types/worldMap";
import type { CraftingFile, CraftingProfession, TrainerSkills } from "@/games/wow-forever/types/crafting";

const FILE = enchantingJson as unknown as CraftingFile;
const DATA: CraftingData = {
  file: FILE,
  recipes: new Map(FILE.recipes.map((r) => [r.spell, r])),
  trainerSkills: (trainerSkillsJson as unknown as Record<CraftingProfession, TrainerSkills>).enchanting,
  sources: createSourceLookup(sourcesJson as unknown as RawSourcesFile),
};

function renderSections() {
  return render(
    <MemoryRouter initialEntries={["/wow-forever/professions?p=enchanting"]}>
      <CraftRouteSections profession="enchanting" faction={FACTION.alliance} zoneId={null} level={null} data={DATA} />
    </MemoryRouter>,
  );
}

function routeSection() {
  const section = document.getElementById("route");
  if (!section) throw new Error("no route section");
  return within(section);
}

describe("Your prices panel", () => {
  beforeEach(() => window.localStorage.clear());

  it("starts on the default route with a nudge to add prices", () => {
    renderSections();
    expect(routeSection().getByText("Default route")).toBeInTheDocument();
    expect(screen.getByText("Prices: not set")).toBeInTheDocument();
    expect(screen.getByText("Add your auction house prices to find the cheapest route.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Your prices/ })).toHaveAttribute("aria-expanded", "false");
  });

  it("reads a typed price back and switches to the cheapest route", async () => {
    renderSections();
    await userEvent.click(screen.getByRole("button", { name: /Your prices/ }));
    const dust = screen.getByLabelText("Strange Dust");
    fireEvent.change(dust, { target: { value: "1g 20s" } });
    expect(screen.getByText("= 1g 20s")).toBeInTheDocument();
    fireEvent.blur(dust);
    // Strange Dust alone prices Dust to Motes at skill 1 — enough for a cheapest pick.
    expect(routeSection().getByText("Cheapest for your prices")).toBeInTheDocument();
    expect(screen.getByText(/Based on 1 price you entered/)).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(PRICES_STORAGE_KEY) ?? "{}")).toEqual({ "10940": 12000 });

    await userEvent.click(screen.getByRole("checkbox", { name: "Use default route" }));
    expect(routeSection().getByText("Default route")).toBeInTheDocument();
  });

  it("flags a price it can't read", async () => {
    renderSections();
    await userEvent.click(screen.getByRole("button", { name: /Your prices/ }));
    const dust = screen.getByLabelText("Strange Dust");
    fireEvent.change(dust, { target: { value: "lots" } });
    expect(dust).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Try 1g 20s")).toBeInTheDocument();
  });

  it("clears prices with an undo", async () => {
    window.localStorage.setItem(PRICES_STORAGE_KEY, JSON.stringify({ "10940": 30 }));
    renderSections();
    await userEvent.click(screen.getByRole("button", { name: /Your prices/ }));
    await userEvent.click(screen.getByRole("button", { name: "Clear prices" }));
    expect(screen.getByLabelText("Strange Dust")).toHaveValue("");
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByLabelText("Strange Dust")).toHaveValue("30c");
  });
});
