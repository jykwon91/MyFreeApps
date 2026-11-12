/**
 * The guild page (/wow-forever/guild/:slug): the member list's search, filters
 * and sort (kept in the URL), and the states that stand in for the list.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { GUILD_SEARCH_DEBOUNCE_MS, GUILD_SORT_KEYS } from "@/games/wow-forever/data/guild/guildConfig";
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
});
