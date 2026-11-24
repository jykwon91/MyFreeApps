/** The Arena's trophy shelf: archived races show their winner, and a date only when one is recorded. */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import GuildArchivedRaces from "@/games/wow-forever/components/guild/GuildArchivedRaces";
import { ARCHIVED_RACES } from "@/games/wow-forever/data/guild/archivedRaces";
import type { ArchivedRace } from "@/games/wow-forever/types/guild/archivedRace";

const WINNER = { slug: "ozrix-forever", name: "Ozrix", surname: "Forever", class_name: "Mage" };

function renderCard(races: readonly ArchivedRace[]) {
  return render(<MemoryRouter><GuildArchivedRaces races={races} /></MemoryRouter>);
}

describe("archived races", () => {
  it("archives the Race to 60 as won by Ozrix Forever, with no date (none is recorded)", () => {
    expect(ARCHIVED_RACES.map((r) => r.id)).toEqual(["race-to-60"]);
    expect(ARCHIVED_RACES[0].day).toBeNull();
    renderCard(ARCHIVED_RACES);
    const card = screen.getByRole("list", { name: "Archived races" });
    expect(card).toHaveTextContent("Race to 60");
    expect(card).toHaveTextContent("Won by");
    expect(card).toHaveTextContent("first to level 60");
    expect(screen.getByRole("link", { name: "Ozrix Forever" })).toHaveAttribute("href", "/wow-forever/character/ozrix-forever");
    expect(card.textContent).not.toMatch(/ on /);
  });

  it("shows the day only when the race has one", () => {
    renderCard([{ id: "r", title: "Race to 60", achievement: "first to level 60", winner: WINNER, day: "2026-11-17" }]);
    expect(screen.getByRole("list", { name: "Archived races" })).toHaveTextContent("first to level 60 on Nov 17");
  });

  it("renders nothing with no archived races", () => {
    const { container } = renderCard([]);
    expect(container).toBeEmptyDOMElement();
  });
});
