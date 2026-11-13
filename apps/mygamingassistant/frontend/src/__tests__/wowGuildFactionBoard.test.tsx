/**
 * The guild page's "One faction's standing" board: the ranking logic, the faction picker kept in
 * `?faction=`, and its loading, empty and error states.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { factionOptionLabel, rankStandings, standingScore, standingStatus } from "@/games/wow-forever/lib/guild/guildStandings";
import { positiveWholeNumber } from "@/games/wow-forever/lib/guild/positiveWholeNumber";
import WowGuildPage from "@/games/wow-forever/pages/WowGuildPage";
import type { GuildMember } from "@/games/wow-forever/types/guild/guildMember";
import type { GuildReputations } from "@/games/wow-forever/types/guild/guildReputations";
import type { GuildReputationsArgs } from "@/games/wow-forever/types/guild/guildReputationsArgs";
import type { GuildResponse } from "@/games/wow-forever/types/guild/guildResponse";
import type { GuildStanding } from "@/games/wow-forever/types/guild/guildStanding";

const mockGuild = vi.fn();
const mockReputations = vi.fn();
vi.mock("@/games/wow-forever/api/wowGuildApi", () => ({
  useGetGuildQuery: () => mockGuild(),
  useSearchGuildRecipesQuery: () => ({ currentData: undefined, isFetching: false, isError: false, refetch: vi.fn() }),
  useGetGuildReputationsQuery: (args: GuildReputationsArgs) => mockReputations(args),
}));

const ROSTER_AT = new Date(Date.now() - 2 * 3_600_000).toISOString();

function member(slug: string, name: string): GuildMember {
  return {
    slug, name, surname: "X", class_name: "Mage", level: 60, item_level: null, honorable_kills: null, killing_blows: null,
    deaths_from_players: null, total_kills: null, total_deaths: null, dungeons_done: null, exalted_reputations: null,
    baseline: null, professions: [], rank: 1, refreshed_at: ROSTER_AT,
  };
}

const MEMBERS = [member("ann-x", "Ann"), member("bob-x", "Bob"), member("cat-x", "Cat"), member("dan-x", "Dan")];
const GUILD: GuildResponse = {
  slug: "topdeadcenter", name: "TopDeadCenter", faction: "alliance", roster_size: 4, roster_updated_at: ROSTER_AT,
  refresh_failed: false, refresh_failed_at: null, can_refresh: false, refresh_available_at: null, gone: false, gains_window_days: 7, members: MEMBERS,
};

function standing(slug: string, tier: number, value: number, max: number): GuildStanding {
  return { slug, tier, value, max };
}

const IRONFORGE: GuildReputations = {
  faction_id: 47,
  factions: [{ id: 47, name: "Ironforge", members: 3 }, { id: 72, name: "Stormwind", members: 1 }],
  standings: [standing("ann-x", 5, 6550, 12000), standing("bob-x", 6, 20, 21000), standing("cat-x", 5, 6550, 12000)],
};

const STORMWIND: GuildReputations = { ...IRONFORGE, faction_id: 72, standings: [standing("dan-x", 4, 100, 6000)] };

/** A settled answer: ``data`` and ``currentData`` are the same unless a test says otherwise. */
function reputations(extra: Record<string, unknown>) {
  return { data: undefined, currentData: extra.data, isFetching: false, isError: false, refetch: vi.fn(), ...extra };
}

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{location.search}</span>;
}

function renderAt(search: string) {
  return render(
    <MemoryRouter initialEntries={[`/wow-forever/guild${search}`]}>
      <Routes>
        <Route path="/wow-forever/guild" element={<WowGuildPage />} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  );
}

function rows(name: string): string[] {
  return within(screen.getByRole("list", { name }))
    .getAllByRole("listitem")
    .map((li) => li.textContent ?? "");
}

beforeEach(() => {
  mockGuild.mockReturnValue({ data: GUILD, error: undefined, isFetching: false, refetch: vi.fn() });
  mockReputations.mockReturnValue(reputations({ data: IRONFORGE }));
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("faction standing logic", () => {
  it("ranks by tier first, then progress, ties sharing a rank and reading by name", () => {
    const ranked = rankStandings(MEMBERS, IRONFORGE.standings);
    expect(ranked.map((e) => [e.member.slug, e.rank, e.tied, e.display, e.detail])).toEqual([
      ["bob-x", 1, false, "Revered", "20 / 21,000"],
      ["ann-x", 2, true, "Honored", "6,550 / 12,000"],
      ["cat-x", 2, true, "Honored", "6,550 / 12,000"],
    ]);
    expect(standingScore(standing("a", 6, 0, 21000))).toBeGreaterThan(standingScore(standing("b", 5, 11999, 12000)));
  });

  it("leaves out standings for characters not in the member list, and shows no progress at an empty Exalted", () => {
    const ranked = rankStandings(MEMBERS, [standing("ann-x", 7, 0, 0), standing("someone-else", 7, 999, 1000)]);
    expect(ranked.map((e) => [e.member.slug, e.display, e.detail])).toEqual([["ann-x", "Exalted", null]]);
  });

  it("labels factions and the status line", () => {
    expect(factionOptionLabel({ id: 47, name: "Ironforge", members: 31 })).toBe("Ironforge (31 members)");
    expect(factionOptionLabel({ id: 47, name: "Ironforge", members: 1 })).toBe("Ironforge (1 member)");
    expect(standingStatus("One faction's standing", "Ironforge", 10, 31)).toBe(
      "One faction's standing: 10 of 31 shown · ranked by standing with Ironforge",
    );
  });

  it("reads only positive whole numbers from the URL", () => {
    expect(positiveWholeNumber("47")).toBe(47);
    for (const bad of [null, "", "0", "-3", "4.5", "abc", "047", "99999999999999999999"]) {
      expect(positiveWholeNumber(bad)).toBeNull();
    }
  });
});

describe("faction standing board", () => {
  it("shows the default faction's standings with both pickers and who isn't ranked", () => {
    renderAt("?board=faction");
    expect(mockReputations).toHaveBeenCalledWith({ slug: "topdeadcenter", faction: null });
    expect(screen.getByLabelText("Rank members by")).toHaveValue("faction");
    expect(screen.getByLabelText("Faction")).toHaveValue("47");
    expect(screen.getByText("One faction's standing: 3 of 3 shown · ranked by standing with Ironforge")).toBeInTheDocument();
    const shown = rows("Ironforge standing leaderboard");
    expect(shown).toHaveLength(3);
    expect(shown[0]).toContain("Bob");
    expect(shown[0]).toContain("Revered");
    expect(shown[1]).toContain("Mage · 6,550 / 12,000");
    expect(screen.getByText(/1 member has no standing with Ironforge that we know of/)).toBeInTheDocument();
  });

  it("picking a faction asks for it and keeps it in the URL", () => {
    mockReputations.mockImplementation((args: GuildReputationsArgs) =>
      reputations({ data: args.faction === 72 ? STORMWIND : IRONFORGE }),
    );
    renderAt("?board=faction");
    fireEvent.change(screen.getByLabelText("Faction"), { target: { value: "72" } });
    expect(screen.getByTestId("location")).toHaveTextContent("faction=72");
    expect(mockReputations).toHaveBeenLastCalledWith({ slug: "topdeadcenter", faction: 72 });
    expect(rows("Stormwind standing leaderboard")[0]).toContain("Friendly");
  });

  it("an unknown faction falls back to the default and the URL says so", () => {
    renderAt("?board=faction&faction=999");
    expect(mockReputations).toHaveBeenCalledWith({ slug: "topdeadcenter", faction: 999 });
    expect(screen.getByTestId("location")).toHaveTextContent("faction=47");
  });

  it("pins the viewer, or says they have no standing with the faction", () => {
    renderAt("?board=faction&me=cat-x");
    expect(within(screen.getByRole("list", { name: "Ironforge standing leaderboard" })).getByText("You")).toBeInTheDocument();
    renderAt("?board=faction&me=dan-x");
    expect(screen.getByText("Your character has no standing with Ironforge that we know of.")).toBeInTheDocument();
  });

  it("keeps the last faction's list, dimmed and busy, while another loads", () => {
    mockReputations.mockReturnValue(reputations({ data: IRONFORGE, currentData: undefined, isFetching: true }));
    renderAt("?board=faction&faction=72");
    expect(rows("Ironforge standing leaderboard")).toHaveLength(3);
    expect(screen.getByTestId("location")).toHaveTextContent("faction=72");
    expect(screen.getByLabelText("Faction").closest("[aria-busy]")).toHaveAttribute("aria-busy", "true");
  });

  it("shows skeleton rows and a disabled faction picker while loading", () => {
    mockReputations.mockReturnValue(reputations({ isFetching: true }));
    renderAt("?board=faction");
    expect(screen.getByTestId("guild-faction-skeleton")).toBeInTheDocument();
    expect(screen.getByLabelText("Faction")).toBeDisabled();
  });

  it("says when nobody has reputation data yet", () => {
    mockReputations.mockReturnValue(reputations({ data: { faction_id: null, factions: [], standings: [] } }));
    renderAt("?board=faction");
    expect(screen.getByText("No reputation data yet. It fills in as members' characters are looked up.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Faction")).toBeNull();
  });

  it("offers a retry when the standings don't load", () => {
    const refetch = vi.fn();
    mockReputations.mockReturnValue(reputations({ isError: true, refetch }));
    renderAt("?board=faction");
    expect(screen.getByText("Couldn't load reputation standings. Check your connection and try again.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalled();
  });

  it("other boards never ask for standings", () => {
    renderAt("?board=level");
    expect(mockReputations).not.toHaveBeenCalled();
  });
});
