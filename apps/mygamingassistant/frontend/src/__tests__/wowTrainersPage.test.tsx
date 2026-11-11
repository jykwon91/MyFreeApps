import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import WowTrainersPage from "@/games/wow-forever/pages/WowTrainersPage";
import { PLAYER_SETTINGS_STORAGE_KEY } from "@/games/wow-forever/hooks/usePlayerSettings";

function renderPage(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/wow-forever/trainers" element={<WowTrainersPage />} />
        <Route path="/wow-forever/trainers/:subject" element={<WowTrainersPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function savePlayer(faction: "A" | "H", level: number | null) {
  window.localStorage.setItem(PLAYER_SETTINGS_STORAGE_KEY, JSON.stringify({ faction, classId: "warlock", zoneId: null, level, position: null }));
}

describe("Trainers page", () => {
  beforeEach(() => window.localStorage.clear());

  it("asks you to pick when nothing is picked", () => {
    renderPage("/wow-forever/trainers");
    expect(screen.getByRole("heading", { level: 1, name: "Trainers" })).toBeInTheDocument();
    expect(screen.getByText("Pick a class or profession to see what it unlocks and where to train it.")).toBeInTheDocument();
    expect(within(screen.getByTestId("trainers-picker")).getByRole("link", { name: "Warlock" })).toHaveAttribute("href", "/wow-forever/trainers/warlock");
  });

  it("every class and profession in the picker shows its in-game icon", () => {
    renderPage("/wow-forever/trainers");
    const links = within(screen.getByTestId("trainers-picker")).getAllByRole("link");
    expect(links).toHaveLength(21);
    for (const link of links) expect(within(link).getByTestId("game-icon")).toBeInTheDocument();
    expect(within(screen.getByRole("link", { name: "Tailoring" })).getByTestId("game-icon")).toHaveAttribute("src", expect.stringContaining("/136249.webp"));
  });

  it("says so for an unknown class or profession", () => {
    renderPage("/wow-forever/trainers/bard");
    expect(screen.getByText(`There's no class or profession called "bard". Pick one above.`)).toBeInTheDocument();
  });

  it("a class: levels below yours fold away, the next one is marked, your faction's trainers are listed", async () => {
    const user = userEvent.setup();
    savePlayer("H", 6);
    renderPage("/wow-forever/trainers/warlock");
    expect(screen.getByTestId("trainers-skeleton")).toBeInTheDocument();
    const learn = await screen.findByRole("region", { name: "What you can learn at each level" });
    const levels = within(learn).getAllByTestId("trainers-level");
    expect(within(levels[0]).getByText("Next")).toBeInTheDocument();
    expect(within(levels[0]).getByRole("list", { name: "Level 6" })).toBeInTheDocument();
    const unlocks = within(within(levels[0]).getByRole("list", { name: "Level 6" })).getAllByRole("listitem");
    for (const unlock of unlocks) expect(within(unlock).getByTestId("game-icon")).toBeInTheDocument();
    expect(within(learn).queryByRole("list", { name: "Level 4" })).not.toBeInTheDocument();
    await user.click(within(learn).getByRole("button", { name: "Show levels 1–4 (below yours)" }));
    expect(within(learn).getByRole("list", { name: "Level 4" })).toBeInTheDocument();

    const trainers = screen.getByRole("list", { name: "Warlock trainers" });
    await user.click(within(trainers.parentElement as HTMLElement).getByRole("button", { name: /^Show all \d+ trainers$/ }));
    expect(within(trainers).getByText("Dhugru Gorelust", { exact: false })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Demon trainers" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Spell details and costs" })).toHaveAttribute("href", "/wow-forever/spellbook/warlock");
  });

  it("a Warlock also sees what each demon learns at each level, with its Grimoire", async () => {
    const user = userEvent.setup();
    savePlayer("A", 8);
    renderPage("/wow-forever/trainers/warlock");
    const demons = await screen.findByRole("region", { name: "What your demons learn at each level" });
    const eight = within(demons).getByRole("list", { name: "Level 8" });
    const firebolt = within(eight).getByText("Firebolt").closest("li") as HTMLElement;
    expect(within(firebolt).getByText("(Rank 2)")).toBeInTheDocument();
    expect(within(firebolt).getByText("Imp")).toBeInTheDocument();
    expect(within(firebolt).getByText("Grimoire")).toBeInTheDocument();
    expect(within(firebolt).getByTestId("game-icon")).toBeInTheDocument();
    expect(within(demons).getAllByTestId("trainers-level")[0]).toHaveTextContent("Next");
    await user.click(within(demons).getByRole("button", { name: "Show levels 1–4 (below yours)" }));
    const one = within(demons).getByRole("list", { name: "Level 1" });
    expect(within(one).getByText("Knows it when summoned")).toBeInTheDocument();
  });

  it("other classes have no demon section", async () => {
    savePlayer("A", null);
    renderPage("/wow-forever/trainers/mage");
    await screen.findByRole("region", { name: "What you can learn at each level" });
    expect(screen.queryByRole("region", { name: "What your demons learn at each level" })).not.toBeInTheDocument();
  });

  it("a Horde Paladin is told Forever's trainers aren't in the data yet", async () => {
    savePlayer("H", null);
    renderPage("/wow-forever/trainers/paladin");
    expect(await screen.findByText(/Forever added Horde Paladin trainers/)).toBeInTheDocument();
  });

  it("a profession: the rank ladder, your faction's trainers and a link to its guide", async () => {
    savePlayer("A", null);
    renderPage("/wow-forever/trainers/tailoring");
    const ranks = await screen.findAllByTestId("trainers-rank");
    expect(ranks.map((r) => within(r).getByRole("heading", { level: 3 }).textContent)).toEqual(["Apprentice", "Journeyman", "Expert", "Artisan"]);
    expect(screen.getByRole("heading", { level: 3, name: "Tailoring trainers" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tailoring guide: fastest route to 300" })).toHaveAttribute("href", "/wow-forever/professions?p=tailoring");
  });
});
