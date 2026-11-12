/**
 * The guild page (/wow-forever/guild/:slug): the leaderboards, the member
 * list's search, filters and sort (kept in the URL), and the states that stand
 * in for the list.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { GUILD_SEARCH_DEBOUNCE_MS, GUILD_SORT_KEYS } from "@/games/wow-forever/data/guild/guildConfig";
import { boardStatus, findBoard, missingCount, rankBoard, topEntries } from "@/games/wow-forever/lib/guild/guildLeaderboards";
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
import type { GuildMember } from "@/games/wow-forever/types/guild/guildMember";
import type { GuildResponse } from "@/games/wow-forever/types/guild/guildResponse";

const mockQuery = vi.fn();
vi.mock("@/games/wow-forever/api/wowGuildApi", () => ({
  useGetGuildQuery: (slug: string, opts: { skip: boolean }) => mockQuery(slug, opts),
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
    professions: [],
    rank: 0,
    refreshed_at: ROSTER_AT,
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
  gone: false,
  members: MEMBERS,
};

function query(extra: Record<string, unknown>) {
  return { data: undefined, error: undefined, isFetching: false, refetch: vi.fn(), ...extra };
}

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{`${location.pathname}${location.search}`}</span>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/wow-forever/guild/:slug" element={<WowGuildPage />} />
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

beforeEach(() => {
  mockQuery.mockReturnValue(query({}));
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
    const custom = { query: "jo", className: "Mage", minLevel: 10, sort: GUILD_SORT_KEYS.level, descending: false };
    expect(filtersFromParams(paramsFromFilters(custom))).toEqual(custom);
    expect(filtersFromParams(new URLSearchParams("sort=bogus&level=7")).sort).toBe(GUILD_SORT_KEYS.rank);
    expect(filtersFromParams(new URLSearchParams("level=7")).minLevel).toBe(0);
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

  it("falls back to the level board for a missing or unknown board", () => {
    expect(findBoard(null).id).toBe("level");
    expect(findBoard("nope").id).toBe("level");
  });
});

describe("guild page", () => {
  it("asks for the lowercased slug and lists members by rank with links to their characters", () => {
    mockQuery.mockReturnValue(query({ data: GUILD }));
    renderAt("/wow-forever/guild/TopDeadCenter");
    expect(mockQuery).toHaveBeenCalledWith("topdeadcenter", { skip: false });
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

  it("sorts from a column header and keeps the sort in the URL", () => {
    mockQuery.mockReturnValue(query({ data: GUILD }));
    renderAt("/wow-forever/guild/topdeadcenter");
    fireEvent.click(within(screen.getByRole("table")).getByRole("button", { name: "Level" }));
    expect(tableNames()).toEqual(["Big Sue", "Jason Kwon", "Tiny John", "New Guy"]);
    expect(screen.getByTestId("location")).toHaveTextContent("/wow-forever/guild/topdeadcenter?sort=level");
    const header = within(screen.getByRole("table")).getByRole("columnheader", { name: /Level/ });
    expect(header).toHaveAttribute("aria-sort", "descending");
  });

  it("ignores a class from an old link that nobody in the guild plays", () => {
    mockQuery.mockReturnValue(query({ data: GUILD }));
    renderAt("/wow-forever/guild/topdeadcenter?class=Druid");
    expect(screen.getByText("Showing 4 of 4 members")).toBeInTheDocument();
    expect(screen.getByLabelText("Class")).toHaveValue("");
  });

  it("filters by class and name from the URL, and Clear filters brings everyone back", () => {
    mockQuery.mockReturnValue(query({ data: GUILD }));
    renderAt("/wow-forever/guild/topdeadcenter?class=Mage&q=sue");
    expect(screen.getByText("No members match.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByText("Showing 4 of 4 members")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent(/^\/wow-forever\/guild\/topdeadcenter$/);
  });

  it("searches by name after a short pause", () => {
    vi.useFakeTimers();
    mockQuery.mockReturnValue(query({ data: GUILD }));
    renderAt("/wow-forever/guild/topdeadcenter");
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "sue" } });
    act(() => {
      vi.advanceTimersByTime(GUILD_SEARCH_DEBOUNCE_MS);
    });
    expect(tableNames()).toEqual(["Big Sue"]);
    expect(screen.getByTestId("location")).toHaveTextContent("?q=sue");
  });

  it("says when we don't have the guild yet", () => {
    mockQuery.mockReturnValue(query({ error: { status: 404, data: { detail: "guild_not_found" } } }));
    renderAt("/wow-forever/guild/nobody");
    expect(screen.getByText(/We don't have this guild yet/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Look up a character" })).toHaveAttribute("href", "/wow-forever/character");
  });

  it("says when the roster is still being collected, with a way to check again", () => {
    const refetch = vi.fn();
    mockQuery.mockReturnValue(query({ data: { ...GUILD, roster_size: null, roster_updated_at: null, members: [] }, refetch }));
    renderAt("/wow-forever/guild/topdeadcenter");
    expect(screen.getByText(/collecting this guild's roster/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    expect(refetch).toHaveBeenCalled();
  });

  it("says when Blizzard no longer lists the guild, and when the last refresh failed", () => {
    mockQuery.mockReturnValue(query({ data: { ...GUILD, gone: true, members: [] } }));
    const { unmount } = renderAt("/wow-forever/guild/topdeadcenter");
    expect(screen.getByText(/Blizzard no longer lists this guild/)).toBeInTheDocument();
    unmount();

    mockQuery.mockReturnValue(query({ data: { ...GUILD, refresh_failed: true } }));
    renderAt("/wow-forever/guild/topdeadcenter");
    expect(screen.getByText(/didn't answer the last roster update/)).toBeInTheDocument();
    expect(tableNames()).toHaveLength(4);
  });

  it("shows a skeleton while loading and a plain problem when the server can't be reached", () => {
    mockQuery.mockReturnValue(query({ isFetching: true }));
    const { container, unmount } = renderAt("/wow-forever/guild/topdeadcenter");
    expect(container.querySelector(".animate-pulse")).not.toBeNull();
    unmount();

    const refetch = vi.fn();
    mockQuery.mockReturnValue(query({ error: { status: "FETCH_ERROR", error: "offline" }, refetch }));
    renderAt("/wow-forever/guild/topdeadcenter");
    expect(screen.getByRole("alert")).toHaveTextContent(/Couldn't load this guild/);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalled();
  });

  it("shows the level board by default and switches boards from the picker, keeping the member filters", () => {
    mockQuery.mockReturnValue(query({ data: GUILD }));
    renderAt("/wow-forever/guild/topdeadcenter?class=Warlock");
    expect(boardNames("Level leaderboard")).toEqual(["Big Sue", "Jason Kwon", "Tiny John"]);
    expect(screen.getByText(/1 member has no number for this yet/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Rank members by"), { target: { value: "dungeons" } });
    expect(screen.getByText(/Nobody in the guild has a number for Dungeons cleared yet/)).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("?class=Warlock&board=dungeons");
  });

  it("marks the viewer's character and pins it under the top 10 when it ranks lower", () => {
    const many = Array.from({ length: 11 }, (_, i) =>
      member({ slug: `m-${i}`, name: `M${String(i).padStart(2, "0")}`, surname: "X", level: 60 - i }),
    );
    mockQuery.mockReturnValue(query({ data: { ...GUILD, members: [...many, member({ level: 2 })] } }));
    renderAt("/wow-forever/guild/topdeadcenter?me=Jason-Kwon");
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
    renderAt("/wow-forever/guild/topdeadcenter?board=fewest-deaths&me=jason-kwon");
    expect(screen.getByText(/Your character isn't on this board/)).toBeInTheDocument();
  });

  it("changing a member filter keeps the board in the URL", () => {
    mockQuery.mockReturnValue(query({ data: GUILD }));
    renderAt("/wow-forever/guild/topdeadcenter?board=exalted&me=jason-kwon");
    fireEvent.change(screen.getByLabelText("Class"), { target: { value: "Mage" } });
    expect(screen.getByTestId("location")).toHaveTextContent("?board=exalted&me=jason-kwon&class=Mage");
  });
});
