/**
 * The guild page (/wow-forever/topdeadcenter): the recipe search, the leaderboards, the member
 * list's search, filters and sort (kept in the URL), and the states that stand
 * in for the list.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { GUILD_SEARCH_DEBOUNCE_MS, GUILD_SORT_KEYS } from "@/games/wow-forever/data/guild/guildConfig";
import { RECIPE_SEARCH_DEBOUNCE_MS } from "@/games/wow-forever/data/guild/recipeSearchConfig";
import {
  boardStatus,
  findBoard,
  gainsNote,
  missingCount,
  noBaselineCount,
  noGainCount,
  rankBoard,
  topEntries,
} from "@/games/wow-forever/lib/guild/guildLeaderboards";
import { crafterSkill, professionName, recipeSearchStatus, searchableQuery } from "@/games/wow-forever/lib/guild/guildRecipes";
import {
  classCounts,
  filterMembers,
  filtersFromParams,
  isMemberStale,
  paramsFromFilters,
  rankLabel,
  sortMembers,
} from "@/games/wow-forever/lib/guild/guildMembers";
import WowGuildPage from "@/games/wow-forever/pages/WowGuildPage";
import WowLegacyGuildRedirect from "@/games/wow-forever/pages/WowLegacyGuildRedirect";
import type { GuildCrafter } from "@/games/wow-forever/types/guild/guildCrafter";
import type { GuildMember } from "@/games/wow-forever/types/guild/guildMember";
import { memberSkill, memberSkillText, professionCounts } from "@/games/wow-forever/lib/guild/guildMemberProfessions";
import type { GuildMemberFilters } from "@/games/wow-forever/types/guild/guildMemberFilters";
import type { GuildMemberBaseline } from "@/games/wow-forever/types/guild/guildMemberBaseline";
import type { GuildRecipeSearch } from "@/games/wow-forever/types/guild/guildRecipeSearch";
import type { GuildRecipeSearchArgs } from "@/games/wow-forever/types/guild/guildRecipeSearchArgs";
import type { GuildResponse } from "@/games/wow-forever/types/guild/guildResponse";

const mockQuery = vi.fn();
const mockRecipes = vi.fn();
vi.mock("@/games/wow-forever/api/wowGuildApi", () => ({
  useGetGuildQuery: (slug: string) => mockQuery(slug),
  useSearchGuildRecipesQuery: (args: GuildRecipeSearchArgs) => mockRecipes(args),
}));

const ROSTER_AT = new Date(Date.now() - 2 * 3_600_000).toISOString();

function member(overrides: Partial<GuildMember>): GuildMember {
  return {
    slug: "jason-kwon",
    name: "Jason",
    surname: "Kwon",
    class_name: "Warlock",
    level: 37,
    item_level: 30,
    honorable_kills: null,
    killing_blows: null,
    deaths_from_players: null,
    total_kills: null,
    total_deaths: null,
    dungeons_done: null,
    exalted_reputations: null,
    baseline: null,
    professions: [],
    rank: 0,
    refreshed_at: ROSTER_AT,
    ...overrides,
  };
}

function baseline(overrides: Partial<GuildMemberBaseline>): GuildMemberBaseline {
  return {
    day: "2026-11-12", level: null, honorable_kills: null, killing_blows: null, total_kills: null, dungeons_done: null,
    ...overrides,
  };
}

const MEMBERS: GuildMember[] = [
  member({}),
  member({ slug: "tiny-john", name: "Tiny", surname: "John", class_name: "Mage", level: 12, item_level: 8, rank: 3 }),
  member({ slug: "big-sue", name: "Big", surname: "Sue", class_name: "Warrior", level: 60, item_level: null, rank: 1 }),
  member({ slug: "new-guy", name: "New", surname: "Guy", class_name: null, level: null, item_level: null, rank: null }),
];

const GUILD: GuildResponse = {
  slug: "topdeadcenter",
  name: "TopDeadCenter",
  faction: "alliance",
  roster_size: 6,
  roster_updated_at: ROSTER_AT,
  refresh_failed: false,
  refresh_failed_at: null,
  can_refresh: false,
  refresh_available_at: null,
  gone: false,
  gains_window_days: 7,
  members: MEMBERS,
};

function query(extra: Record<string, unknown>) {
  return { data: undefined, error: undefined, isFetching: false, refetch: vi.fn(), ...extra };
}

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{`${location.pathname}${location.search}${location.hash}`}</span>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/wow-forever/topdeadcenter" element={<WowGuildPage />} />
        <Route path="/wow-forever/guild" element={<WowLegacyGuildRedirect />} />
        <Route path="/wow-forever/guild/:slug" element={<WowLegacyGuildRedirect />} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  );
}

function tableNames(): string[] {
  const table = screen.getByRole("table");
  return within(table)
    .getAllByRole("link")
    .map((a) => a.textContent ?? "");
}

function crafter(overrides: Partial<GuildCrafter>): GuildCrafter {
  return { slug: "jason-kwon", name: "Jason", surname: "Kwon", class_name: "Warlock", skill: 148, max_skill: 225, ...overrides };
}

const LINEN: GuildRecipeSearch = {
  query: "linen",
  truncated: false,
  recipes: [
    {
      id: 2963,
      name: "Bolt of Linen Cloth",
      profession_id: 197,
      crafters: [crafter({}), crafter({ slug: "tiny-john", name: "Tiny", surname: "John", class_name: "Mage", skill: null, max_skill: null })],
    },
  ],
};

function recipes(extra: Record<string, unknown>) {
  return { currentData: undefined, isFetching: false, isError: false, refetch: vi.fn(), ...extra };
}

function typeRecipe(text: string) {
  fireEvent.change(screen.getByLabelText("Recipe"), { target: { value: text } });
  act(() => {
    vi.advanceTimersByTime(RECIPE_SEARCH_DEBOUNCE_MS);
  });
}

beforeEach(() => {
  mockQuery.mockReturnValue(query({}));
  mockRecipes.mockReturnValue(recipes({}));
});

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("guild member list logic", () => {
  it("names ranks: 0 is the guild master", () => {
    expect(rankLabel(0)).toBe("Guild master");
    expect(rankLabel(4)).toBe("Rank 4");
    expect(rankLabel(null)).toBeNull();
  });

  it("filters by name, class and lowest level; an unknown level never passes a level filter", () => {
    const base = filtersFromParams(new URLSearchParams());
    expect(filterMembers(MEMBERS, { ...base, query: "tiny" }).map((m) => m.slug)).toEqual(["tiny-john"]);
    expect(filterMembers(MEMBERS, { ...base, className: "Warlock" }).map((m) => m.slug)).toEqual(["jason-kwon"]);
    expect(filterMembers(MEMBERS, { ...base, minLevel: 30 }).map((m) => m.slug)).toEqual(["jason-kwon", "big-sue"]);
  });

  it("sorts with missing values last in either direction, never as 0", () => {
    const byIlvlDesc = sortMembers(MEMBERS, GUILD_SORT_KEYS.itemLevel, true).map((m) => m.slug);
    const byIlvlAsc = sortMembers(MEMBERS, GUILD_SORT_KEYS.itemLevel, false).map((m) => m.slug);
    expect(byIlvlDesc).toEqual(["jason-kwon", "tiny-john", "big-sue", "new-guy"]);
    expect(byIlvlAsc).toEqual(["tiny-john", "jason-kwon", "big-sue", "new-guy"]);
    expect(sortMembers(MEMBERS, GUILD_SORT_KEYS.rank, false).map((m) => m.slug)).toEqual([
      "jason-kwon",
      "big-sue",
      "tiny-john",
      "new-guy",
    ]);
  });

  it("round-trips its state through the URL, leaving defaults out", () => {
    const base = filtersFromParams(new URLSearchParams());
    expect(paramsFromFilters(base).toString()).toBe("");
    const custom: GuildMemberFilters = {
      query: "jo", className: "Mage", minLevel: 10, profession: "tailoring", sort: GUILD_SORT_KEYS.level, descending: false,
    };
    expect(paramsFromFilters(custom).get("prof")).toBe("tailoring");
    expect(filtersFromParams(paramsFromFilters(custom))).toEqual(custom);
    expect(filtersFromParams(new URLSearchParams("prof=basketweaving")).profession).toBe("");
    expect(filtersFromParams(new URLSearchParams("sort=bogus&level=7")).sort).toBe(GUILD_SORT_KEYS.rank);
    expect(filtersFromParams(new URLSearchParams("level=7")).minLevel).toBe(0);
  });

  it("filters by profession and counts each profession someone has, in the picker's order", () => {
    const crafters = [
      member({ slug: "a-a", professions: [{ id: 197, skill: 148, max_skill: 225 }, { id: 185, skill: 75, max_skill: 75 }] }),
      member({ slug: "b-b", professions: [{ id: 171, skill: 300, max_skill: 300 }] }),
      member({ slug: "c-c", professions: [{ id: 197, skill: 300, max_skill: 300 }] }),
      member({ slug: "d-d", professions: [] }),
    ];
    const base = filtersFromParams(new URLSearchParams());
    expect(filterMembers(crafters, { ...base, profession: "tailoring" }).map((m) => m.slug)).toEqual(["a-a", "c-c"]);
    expect(filterMembers(crafters, { ...base, profession: "mining" })).toEqual([]);
    expect(memberSkill(crafters[0], "tailoring")).toBe("148 / 225");
    expect(memberSkill(crafters[3], "tailoring")).toBeNull();
    expect(memberSkillText(crafters[0], "cooking")).toBe("Cooking 75 / 75");
    expect(memberSkillText(crafters[1], "cooking")).toBeNull();
    expect(professionCounts(crafters).map((p) => [p.label, p.count])).toEqual([
      ["Alchemy", 1],
      ["Tailoring", 2],
      ["Cooking", 1],
    ]);
  });

  it("counts classes and spots a member whose profile stopped refreshing", () => {
    expect(classCounts(MEMBERS)).toEqual([
      ["Mage", 1],
      ["Warlock", 1],
      ["Warrior", 1],
    ]);
    const old = new Date(Date.parse(ROSTER_AT) - 3 * 24 * 3_600_000).toISOString();
    expect(isMemberStale(member({ refreshed_at: old }), ROSTER_AT)).toBe(true);
    expect(isMemberStale(member({}), ROSTER_AT)).toBe(false);
    expect(isMemberStale(member({ refreshed_at: old }), null)).toBe(false);
    const hoursBefore = (hours: number) => new Date(Date.parse(ROSTER_AT) - hours * 3_600_000).toISOString();
    // Hourly rosters; a big guild's members are refreshed over a few runs.
    expect(isMemberStale(member({ refreshed_at: hoursBefore(5) }), ROSTER_AT)).toBe(false);
    expect(isMemberStale(member({ refreshed_at: hoursBefore(7) }), ROSTER_AT)).toBe(true);
  });
});

function boardNames(name: string): string[] {
  return within(screen.getByRole("list", { name }))
    .getAllByRole("link")
    .map((a) => a.textContent ?? "");
}

describe("guild leaderboard logic", () => {
  const dungeons = findBoard("dungeons");

  it("ranks best first, ties share a rank and read by name, and a missing number is left off, never 0", () => {
    const members = [
      member({ slug: "a-a", name: "Zed", surname: "A", dungeons_done: 4 }),
      member({ slug: "b-b", name: "Amy", surname: "B", dungeons_done: 4 }),
      member({ slug: "c-c", name: "Cat", surname: "C", dungeons_done: 7 }),
      member({ slug: "d-d", name: "Dan", surname: "D", dungeons_done: 1 }),
      member({ slug: "e-e", name: "Eve", surname: "E", dungeons_done: null }),
    ];
    const ranked = rankBoard(members, dungeons);
    expect(ranked.map((e) => [e.member.name, e.rank, e.tied])).toEqual([
      ["Cat", 1, false], ["Amy", 2, true], ["Zed", 2, true], ["Dan", 4, false],
    ]);
    expect(missingCount(members, dungeons, ranked.length)).toBe(1);
  });

  it("keeps everyone tied at the top-10 cut", () => {
    const members = Array.from({ length: 12 }, (_, i) =>
      member({ slug: `m-${i}`, name: `M${String(i).padStart(2, "0")}`, dungeons_done: i < 9 ? 20 - i : 5 }),
    );
    expect(topEntries(rankBoard(members, dungeons))).toHaveLength(12);
  });

  it("ranks fewest deaths lowest first among level 60s only, with 0 deaths a real first place", () => {
    const board = findBoard("fewest-deaths");
    const members = [
      member({ slug: "alt-one", name: "Alt", level: 8, total_deaths: 0 }),
      member({ slug: "max-one", name: "Max", level: 60, total_deaths: 40 }),
      member({ slug: "zen-one", name: "Zen", level: 60, total_deaths: 0 }),
    ];
    expect(rankBoard(members, board).map((e) => e.member.name)).toEqual(["Zen", "Max"]);
  });

  it("ranks a profession by skill and shows it against the rank's cap; not learning it isn't missing data", () => {
    const board = findBoard("prof-tailoring");
    const members = [
      member({ slug: "a-a", name: "Ann", professions: [{ id: 197, skill: 148, max_skill: 225 }] }),
      member({ slug: "b-b", name: "Bob", professions: [{ id: 171, skill: 300, max_skill: 300 }] }),
    ];
    const ranked = rankBoard(members, board);
    expect(ranked.map((e) => [e.member.name, e.display])).toEqual([["Ann", "148 / 225"]]);
    expect(missingCount(members, board, ranked.length)).toBe(0);
  });

  it("cuts a huge tie (most of the guild at 60) to the first 10", () => {
    const members = Array.from({ length: 30 }, (_, i) => member({ slug: `m-${i}`, name: `M${String(i).padStart(2, "0")}`, level: 60 }));
    const top = topEntries(rankBoard(members, findBoard("level")));
    expect(top.map((e) => e.member.name)).toEqual(Array.from({ length: 10 }, (_, i) => `M${String(i).padStart(2, "0")}`));
  });

  it("says what the board shows above it", () => {
    expect(boardStatus(findBoard("level"), 10, 31, 12)).toBe("Level: 10 of 31 shown · 12 members at 60");
    expect(boardStatus(findBoard("fewest-deaths"), 0, 0, 0)).toBe("Fewest deaths (level 60): nobody yet · level 60 characters only");
  });

  it("ranks gains since each member's baseline, leaves out no gain and no older day, and says since when", () => {
    const board = findBoard("honorable-kills-gained");
    const members = [
      member({ slug: "a-a", name: "Ann", honorable_kills: 40, baseline: baseline({ honorable_kills: 10, day: "2026-11-12" }) }),
      member({ slug: "b-b", name: "Bob", honorable_kills: 9, baseline: baseline({ honorable_kills: 4, day: "2026-11-14" }) }),
      member({ slug: "c-c", name: "Cat", honorable_kills: 5, baseline: baseline({ honorable_kills: 5 }) }),
      // A smaller number than before (Blizzard reset it) is no gain, never negative.
      member({ slug: "d-d", name: "Dan", honorable_kills: 2, baseline: baseline({ honorable_kills: 8 }) }),
      member({ slug: "e-e", name: "Eve", honorable_kills: 30, baseline: null }),
      member({ slug: "f-f", name: "Fay", honorable_kills: 30, baseline: baseline({ honorable_kills: null }) }),
    ];
    const ranked = rankBoard(members, board);
    expect(ranked.map((e) => [e.member.name, e.display, e.detail])).toEqual([
      ["Ann", "+30", "since Nov 12"], ["Bob", "+5", "since Nov 14"],
    ]);
    expect(noGainCount(members, board)).toBe(2);
    // Eve has no older day; Fay has one but no number for it.
    expect(noBaselineCount(members, board)).toBe(1);
    expect(missingCount(members, board, ranked.length)).toBe(1);
    expect(noBaselineCount(members, dungeons)).toBe(0);
    expect(gainsNote(7)).toMatch(/at least 7 days ago/);
    expect(rankBoard(members, dungeons)[0]?.detail ?? null).toBeNull();
  });

  it("falls back to the level board for a missing or unknown board", () => {
    expect(findBoard(null).id).toBe("level");
    expect(findBoard("nope").id).toBe("level");
  });
});

describe("guild page", () => {
  it("always asks for topdeadcenter and lists members by rank with links to their characters", () => {
    mockQuery.mockReturnValue(query({ data: GUILD }));
    renderAt("/wow-forever/topdeadcenter?tab=roster");
    expect(mockQuery).toHaveBeenCalledWith("topdeadcenter");
    expect(screen.getByRole("heading", { name: "<TopDeadCenter>" })).toBeInTheDocument();
    expect(screen.getByText("4 of 6 members shown")).toBeInTheDocument();
    expect(screen.getByText(/2 members have no profile from Blizzard/)).toBeInTheDocument();
    expect(screen.getByText("Showing 4 of 4 members")).toBeInTheDocument();
    expect(tableNames()).toEqual(["Jason Kwon", "Big Sue", "Tiny John", "New Guy"]);
    expect(within(screen.getByRole("table")).getByRole("link", { name: "Tiny John" })).toHaveAttribute(
      "href",
      "/wow-forever/character/tiny-john",
    );
  });

  it("filters the roster by profession and shows each member's skill in it", () => {
    const members = [
      member({ professions: [{ id: 197, skill: 148, max_skill: 225 }] }),
      member({ slug: "big-sue", name: "Big", surname: "Sue", rank: 1, professions: [{ id: 171, skill: 300, max_skill: 300 }] }),
    ];
    mockQuery.mockReturnValue(query({ data: { ...GUILD, members } }));
    renderAt("/wow-forever/topdeadcenter?tab=roster");
    const select = screen.getByLabelText("Profession");
    expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Any profession",
      "Alchemy (1)",
      "Tailoring (1)",
    ]);
    expect(screen.queryByRole("columnheader", { name: "Tailoring" })).toBeNull();
    fireEvent.change(select, { target: { value: "tailoring" } });
    expect(screen.getByTestId("location")).toHaveTextContent(/prof=tailoring/);
    expect(tableNames()).toEqual(["Jason Kwon"]);
    expect(screen.getByRole("columnheader", { name: "Tailoring" })).toBeInTheDocument();
    expect(within(screen.getByRole("table")).getByText("148 / 225")).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Guild members" })).getByText(/Tailoring 148 \/ 225/)).toBeInTheDocument();
  });

  it("shows everyone when a shared link names a profession nobody in the guild has, and drops it on the next change", () => {
    const members = MEMBERS.map((m) => ({ ...m, professions: [] }));
    mockQuery.mockReturnValue(query({ data: { ...GUILD, members } }));
    renderAt("/wow-forever/topdeadcenter?tab=roster&prof=tailoring");
    expect(screen.getByText("Showing 4 of 4 members")).toBeInTheDocument();
    expect(screen.getByLabelText("Profession")).toHaveValue("");
    fireEvent.change(screen.getByLabelText("Class"), { target: { value: "Mage" } });
    expect(screen.getByTestId("location")).toHaveTextContent(/class=Mage/);
    expect(screen.getByTestId("location")).not.toHaveTextContent(/prof=/);
  });

  it("sends an old guild link, for any guild, to topdeadcenter's page with its query kept", () => {
    mockQuery.mockReturnValue(query({ data: GUILD }));
    renderAt("/wow-forever/guild/some-other-guild?me=jason-kwon");
    expect(screen.getByTestId("location")).toHaveTextContent(/^\/wow-forever\/topdeadcenter\?me=jason-kwon$/);
    expect(mockQuery).toHaveBeenCalledWith("topdeadcenter");
    expect(mockQuery).not.toHaveBeenCalledWith("some-other-guild");
  });

  it("sends the old /wow-forever/guild address to /wow-forever/topdeadcenter with its tab and hash kept", () => {
    mockQuery.mockReturnValue(query({ data: GUILD }));
    renderAt("/wow-forever/guild?tab=roster#roll-call");
    expect(screen.getByTestId("location")).toHaveTextContent(/^\/wow-forever\/topdeadcenter\?tab=roster#roll-call$/);
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("sorts from a column header and keeps the sort in the URL", () => {
    mockQuery.mockReturnValue(query({ data: GUILD }));
    renderAt("/wow-forever/topdeadcenter?tab=roster");
    fireEvent.click(within(screen.getByRole("table")).getByRole("button", { name: "Level" }));
    expect(tableNames()).toEqual(["Big Sue", "Jason Kwon", "Tiny John", "New Guy"]);
    expect(screen.getByTestId("location")).toHaveTextContent("/wow-forever/topdeadcenter?tab=roster&sort=level");
    const header = within(screen.getByRole("table")).getByRole("columnheader", { name: /Level/ });
    expect(header).toHaveAttribute("aria-sort", "descending");
  });

  it("ignores a class from an old link that nobody in the guild plays", () => {
    mockQuery.mockReturnValue(query({ data: GUILD }));
    renderAt("/wow-forever/topdeadcenter?class=Druid");
    expect(screen.getByText("Showing 4 of 4 members")).toBeInTheDocument();
    expect(screen.getByLabelText("Class")).toHaveValue("");
  });

  it("filters by class and name from the URL, and Clear filters brings everyone back", () => {
    mockQuery.mockReturnValue(query({ data: GUILD }));
    renderAt("/wow-forever/topdeadcenter?class=Mage&q=sue");
    expect(screen.getByText("No members match.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByText("Showing 4 of 4 members")).toBeInTheDocument();
    // The old link opened the Roster tab without naming it; it's named now, so clearing the filters stays there.
    expect(screen.getByTestId("location")).toHaveTextContent(/^\/wow-forever\/topdeadcenter\?tab=roster$/);
  });

  it("searches by name after a short pause", () => {
    vi.useFakeTimers();
    mockQuery.mockReturnValue(query({ data: GUILD }));
    renderAt("/wow-forever/topdeadcenter?tab=roster");
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "sue" } });
    act(() => {
      vi.advanceTimersByTime(GUILD_SEARCH_DEBOUNCE_MS);
    });
    expect(tableNames()).toEqual(["Big Sue"]);
    expect(screen.getByTestId("location")).toHaveTextContent("?tab=roster&q=sue");
  });

  it("says when we don't have the guild yet", () => {
    mockQuery.mockReturnValue(query({ error: { status: 404, data: { detail: "guild_not_found" } } }));
    renderAt("/wow-forever/topdeadcenter");
    expect(screen.getByText(/We don't have <TopDeadCenter> yet/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Look up a character" })).toHaveAttribute("href", "/wow-forever/character");
  });

  it("says when the roster is still being collected, with a way to check again", () => {
    const refetch = vi.fn();
    mockQuery.mockReturnValue(query({ data: { ...GUILD, roster_size: null, roster_updated_at: null, members: [] }, refetch }));
    renderAt("/wow-forever/topdeadcenter");
    expect(screen.getByText(/collecting this guild's roster/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    expect(refetch).toHaveBeenCalled();
  });

  it("says when Blizzard no longer lists the guild, and when the last refresh failed", () => {
    mockQuery.mockReturnValue(query({ data: { ...GUILD, gone: true, members: [] } }));
    const { unmount } = renderAt("/wow-forever/topdeadcenter");
    expect(screen.getByText(/Blizzard no longer lists this guild/)).toBeInTheDocument();
    unmount();

    mockQuery.mockReturnValue(query({ data: { ...GUILD, refresh_failed: true } }));
    renderAt("/wow-forever/topdeadcenter?tab=roster");
    expect(screen.getByText(/didn't answer the last roster update/)).toBeInTheDocument();
    expect(tableNames()).toHaveLength(4);
  });

  it("shows a skeleton while loading and a plain problem when the server can't be reached", () => {
    mockQuery.mockReturnValue(query({ isFetching: true }));
    const { container, unmount } = renderAt("/wow-forever/topdeadcenter");
    expect(container.querySelector(".animate-pulse")).not.toBeNull();
    unmount();

    const refetch = vi.fn();
    mockQuery.mockReturnValue(query({ error: { status: "FETCH_ERROR", error: "offline" }, refetch }));
    renderAt("/wow-forever/topdeadcenter");
    expect(screen.getByRole("alert")).toHaveTextContent(/Couldn't load this guild/);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalled();
  });

  it("shows the level board by default and switches boards from the picker, keeping the member filters", () => {
    mockQuery.mockReturnValue(query({ data: GUILD }));
    renderAt("/wow-forever/topdeadcenter?tab=home&class=Warlock");
    expect(boardNames("Level leaderboard")).toEqual(["Big Sue", "Jason Kwon", "Tiny John"]);
    expect(screen.getByText(/1 member has no number for this yet/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Rank members by"), { target: { value: "dungeons" } });
    expect(screen.getByText(/Nobody in the guild has a number for Dungeons cleared yet/)).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("?tab=home&class=Warlock&board=dungeons");
  });

  it("marks the viewer's character and pins it under the top 10 when it ranks lower", () => {
    const many = Array.from({ length: 11 }, (_, i) =>
      member({ slug: `m-${i}`, name: `M${String(i).padStart(2, "0")}`, surname: "X", level: 60 - i }),
    );
    mockQuery.mockReturnValue(query({ data: { ...GUILD, members: [...many, member({ level: 2 })] } }));
    renderAt("/wow-forever/topdeadcenter?me=Jason-Kwon");
    expect(boardNames("Level leaderboard")).toHaveLength(10);
    const pinned = screen.getByRole("list", { name: "Your character" });
    expect(within(pinned).getByText("12")).toBeInTheDocument();
    expect(within(pinned).getByText("You")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show all 12" }));
    expect(boardNames("Level leaderboard")).toHaveLength(12);
    expect(screen.queryByRole("list", { name: "Your character" })).toBeNull();
  });

  it("says when the viewer's character isn't on the board", () => {
    mockQuery.mockReturnValue(query({ data: GUILD }));
    renderAt("/wow-forever/topdeadcenter?board=fewest-deaths&me=jason-kwon");
    expect(screen.getByText(/Your character isn't on this board/)).toBeInTheDocument();
  });

  it("shows a gains board with since-when under each name, and says who isn't ranked and why", () => {
    const members = [
      member({ level: 40, baseline: baseline({ level: 37, day: "2026-11-12" }) }),
      member({ slug: "tiny-john", name: "Tiny", surname: "John", class_name: "Mage", level: 12, baseline: baseline({ level: 12 }) }),
      member({ slug: "new-guy", name: "New", surname: "Guy", level: 5 }),
    ];
    mockQuery.mockReturnValue(query({ data: { ...GUILD, members } }));
    renderAt("/wow-forever/topdeadcenter?board=levels-gained&me=new-guy");
    const board = screen.getByRole("list", { name: "Levels gained leaderboard" });
    expect(within(board).getByText("+3")).toBeInTheDocument();
    expect(within(board).getByText("Warlock · since Nov 12")).toBeInTheDocument();
    expect(screen.getByText(/at least 7 days ago/)).toBeInTheDocument();
    expect(screen.getByText("1 member had no gain, so they're not ranked.")).toBeInTheDocument();
    expect(screen.getByText("1 member needs a second lookup on another day to show a gain.")).toBeInTheDocument();
    expect(screen.getByText(/Your character has no gain here yet/)).toBeInTheDocument();
  });

  it("says plainly when nobody has a gain yet", () => {
    mockQuery.mockReturnValue(query({ data: GUILD }));
    renderAt("/wow-forever/topdeadcenter?board=dungeons-gained");
    expect(screen.getByText(/No gains to show yet/)).toBeInTheDocument();
  });

  it("changing a member filter keeps the board in the URL", () => {
    mockQuery.mockReturnValue(query({ data: GUILD }));
    renderAt("/wow-forever/topdeadcenter?tab=roster&board=exalted&me=jason-kwon");
    fireEvent.change(screen.getByLabelText("Class"), { target: { value: "Mage" } });
    expect(screen.getByTestId("location")).toHaveTextContent("?tab=roster&board=exalted&me=jason-kwon&class=Mage");
  });
});

describe("guild recipe search logic", () => {
  it("names professions by their SkillLine id", () => {
    expect(professionName(197)).toBe("Tailoring");
    expect(professionName(185)).toBe("Cooking");
    expect(professionName(1)).toBe("Profession");
  });

  it("shows a crafter's skill against the cap, alone without one, nothing when unknown", () => {
    expect(crafterSkill(crafter({}))).toBe("148 / 225");
    expect(crafterSkill(crafter({ max_skill: null }))).toBe("148");
    expect(crafterSkill(crafter({ skill: null, max_skill: null }))).toBeNull();
  });

  it("searches only two letters or more, trimmed", () => {
    expect(searchableQuery(" l ")).toBe("");
    expect(searchableQuery(" li ")).toBe("li");
    expect(searchableQuery("x".repeat(80))).toHaveLength(60);
  });

  it("says how many recipes matched, and when there were more", () => {
    expect(recipeSearchStatus(LINEN)).toBe('1 recipe matching "linen"');
    expect(recipeSearchStatus({ ...LINEN, truncated: true })).toBe(
      'First 1 recipe matching "linen" — type more of the name to narrow it down',
    );
  });
});

describe("guild recipe search", () => {
  it("searches after a short pause, keeps the search in the URL, and lists who knows each recipe", () => {
    vi.useFakeTimers();
    mockQuery.mockReturnValue(query({ data: GUILD }));
    mockRecipes.mockReturnValue(recipes({ currentData: LINEN }));
    renderAt("/wow-forever/topdeadcenter?tab=crafting&board=exalted");
    typeRecipe("  linen ");

    expect(screen.getByTestId("location")).toHaveTextContent("?tab=crafting&board=exalted&recipe=linen");
    // Our own trimmed write never reaches back into the box mid-typing.
    expect(screen.getByLabelText("Recipe")).toHaveValue("  linen ");
    expect(mockRecipes).toHaveBeenLastCalledWith({ slug: "topdeadcenter", query: "linen" });
    expect(screen.getByText('1 recipe matching "linen"')).toBeInTheDocument();
    const who = within(screen.getByRole("list", { name: "Who knows Bolt of Linen Cloth" }));
    expect(who.getAllByRole("link").map((a) => a.textContent)).toEqual(["Jason Kwon"]);
    expect(who.getByRole("link", { name: "Jason Kwon" })).toHaveAttribute("href", "/wow-forever/character/jason-kwon");
    expect(who.getByText("148 / 225")).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Matching recipes" })).getByText("Tailoring")).toBeInTheDocument();
  });

  it("shows only the top crafter, and a button reveals and hides the rest in order", () => {
    vi.useFakeTimers();
    mockQuery.mockReturnValue(query({ data: GUILD }));
    mockRecipes.mockReturnValue(recipes({ currentData: LINEN }));
    renderAt("/wow-forever/topdeadcenter?tab=crafting&recipe=linen");
    const names = () =>
      within(screen.getByRole("list", { name: "Who knows Bolt of Linen Cloth" }))
        .getAllByRole("link")
        .map((a) => a.textContent);

    expect(names()).toEqual(["Jason Kwon"]);
    const toggle = screen.getByRole("button", { name: "Show 1 more" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAttribute("aria-controls", screen.getByRole("list", { name: "Who knows Bolt of Linen Cloth" }).id);

    fireEvent.click(toggle);
    expect(names()).toEqual(["Jason Kwon", "Tiny John"]);
    expect(screen.getByRole("button", { name: "Show fewer" })).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(screen.getByRole("button", { name: "Show fewer" }));
    expect(names()).toEqual(["Jason Kwon"]);
    expect(screen.getByRole("button", { name: "Show 1 more" })).toHaveAttribute("aria-expanded", "false");
  });

  it("counts the hidden crafters, and offers no button for a lone crafter", () => {
    vi.useFakeTimers();
    mockQuery.mockReturnValue(query({ data: GUILD }));
    const third = crafter({ slug: "ann-lee", name: "Ann", surname: "Lee", skill: 100 });
    const [linen] = LINEN.recipes;
    mockRecipes.mockReturnValue(
      recipes({
        currentData: {
          ...LINEN,
          recipes: [
            { ...linen, crafters: [...linen.crafters, third] },
            { ...linen, id: 1, name: "Solo Recipe", crafters: [crafter({})] },
          ],
        },
      }),
    );
    renderAt("/wow-forever/topdeadcenter?tab=crafting&recipe=linen");
    expect(screen.getAllByRole("button", { name: /^Show/ })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Show 2 more" })).toBeInTheDocument();
  });

  it("doesn't search one letter, and clearing the box drops it from the URL", () => {
    vi.useFakeTimers();
    mockQuery.mockReturnValue(query({ data: GUILD }));
    renderAt("/wow-forever/topdeadcenter?recipe=linen");
    typeRecipe("l");
    expect(screen.getByTestId("location")).toHaveTextContent("?recipe=l");
    expect(mockRecipes).not.toHaveBeenCalledWith({ slug: "topdeadcenter", query: "l" });
    typeRecipe("");
    // The link opened the crafting tab without naming it; it's named now, so clearing the search stays there.
    expect(screen.getByTestId("location").textContent).toBe("/wow-forever/topdeadcenter?tab=crafting");
  });

  it("opens with the search from the URL", () => {
    mockQuery.mockReturnValue(query({ data: GUILD }));
    mockRecipes.mockReturnValue(recipes({ currentData: LINEN }));
    renderAt("/wow-forever/topdeadcenter?recipe=linen");
    expect(screen.getByLabelText("Recipe")).toHaveValue("linen");
    expect(screen.getByText("Bolt of Linen Cloth")).toBeInTheDocument();
  });

  it("shows a skeleton while searching, says when nobody knows it, and offers a retry on a problem", () => {
    mockQuery.mockReturnValue(query({ data: GUILD }));
    mockRecipes.mockReturnValue(recipes({ isFetching: true }));
    const first = renderAt("/wow-forever/topdeadcenter?recipe=zzz");
    expect(screen.getByTestId("guild-recipe-skeleton")).toBeInTheDocument();
    first.unmount();

    mockRecipes.mockReturnValue(recipes({ currentData: { query: "zzz", recipes: [], truncated: false } }));
    const second = renderAt("/wow-forever/topdeadcenter?recipe=zzz");
    expect(screen.getByText(/Nobody in the guild knows a recipe matching "zzz"/)).toBeInTheDocument();
    second.unmount();

    const refetch = vi.fn();
    mockRecipes.mockReturnValue(recipes({ isError: true, refetch }));
    renderAt("/wow-forever/topdeadcenter?recipe=zzz");
    expect(screen.getByText("Couldn't search the guild's recipes.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Try again|Retry/ }));
    expect(refetch).toHaveBeenCalled();
  });
});
