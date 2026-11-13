/**
 * The Guild menu item (/wow-forever/guild): opens the remembered guild, else a search over the
 * guilds we have; the guild page links back to the search and forgets a guild that's gone.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { GUILD_FINDER_DEBOUNCE_MS, REMEMBERED_GUILD_STORAGE_KEY } from "@/games/wow-forever/data/guild/guildFinderConfig";
import { guildMemberCount, guildSearchStatus } from "@/games/wow-forever/lib/guild/guildFinder";
import { parseRememberedGuild } from "@/games/wow-forever/lib/guild/rememberedGuild";
import WowGuildFinderPage from "@/games/wow-forever/pages/WowGuildFinderPage";
import WowGuildPage from "@/games/wow-forever/pages/WowGuildPage";
import type { GuildSearch } from "@/games/wow-forever/types/guild/guildSearch";

const mockSearch = vi.fn();
const mockGuild = vi.fn();
vi.mock("@/games/wow-forever/api/wowGuildApi", () => ({
  useSearchGuildsQuery: (q: string) => mockSearch(q),
  useGetGuildQuery: (slug: string, opts: { skip: boolean }) => mockGuild(slug, opts),
  useSearchGuildRecipesQuery: () => ({ currentData: undefined, isFetching: false, isError: false, refetch: vi.fn() }),
}));

const REMEMBERED = { slug: "topdeadcenter", name: "TopDeadCenter", faction: "alliance" };
const RESULTS: GuildSearch = {
  query: "dead",
  guilds: [
    { slug: "dead-men-walking", name: "Dead Men Walking", faction: "horde", member_count: 120 },
    { slug: "topdeadcenter", name: "TopDeadCenter", faction: "alliance", member_count: null },
  ],
  truncated: false,
};

function search(extra: Record<string, unknown>) {
  return { currentData: undefined, isFetching: false, isError: false, refetch: vi.fn(), ...extra };
}

function guildQuery(extra: Record<string, unknown>) {
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
        <Route path="/wow-forever/guild" element={<WowGuildFinderPage />} />
        <Route path="/wow-forever/guild/:slug" element={<WowGuildPage />} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  );
}

function remember(): void {
  window.localStorage.setItem(REMEMBERED_GUILD_STORAGE_KEY, JSON.stringify(REMEMBERED));
}

function stored(): unknown {
  return JSON.parse(window.localStorage.getItem(REMEMBERED_GUILD_STORAGE_KEY) ?? "null");
}

beforeEach(() => {
  window.localStorage.clear();
  mockSearch.mockReturnValue(search({}));
  mockGuild.mockReturnValue(guildQuery({ isFetching: true }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("the Guild menu item", () => {
  it("opens the remembered guild", () => {
    remember();
    renderAt("/wow-forever/guild");
    expect(screen.getByTestId("location")).toHaveTextContent(/^\/wow-forever\/guild\/topdeadcenter$/);
  });

  it("with no guild remembered, offers the search and how to add yours", () => {
    renderAt("/wow-forever/guild");
    expect(screen.getByRole("heading", { name: "Find a guild" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Guild name" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Look up your character" })).toHaveAttribute("href", "/wow-forever/character");
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it("with ?find, stays on the search and shows your guild above it", () => {
    remember();
    renderAt("/wow-forever/guild?find=1");
    expect(screen.getByTestId("location")).toHaveTextContent("/wow-forever/guild?find=1");
    const yours = screen.getByRole("region", { name: "Your guild" });
    expect(within(yours).getByRole("link", { name: /TopDeadCenter/ })).toHaveAttribute("href", "/wow-forever/guild/topdeadcenter");
    expect(screen.getByRole("heading", { name: "Find another guild" })).toBeInTheDocument();
  });

  it("searches as you type, after a pause, and keeps the search in the URL", () => {
    vi.useFakeTimers();
    mockSearch.mockReturnValue(search({ currentData: RESULTS }));
    renderAt("/wow-forever/guild");
    fireEvent.change(screen.getByRole("searchbox", { name: "Guild name" }), { target: { value: "dead" } });
    expect(mockSearch).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(GUILD_FINDER_DEBOUNCE_MS);
    });
    expect(mockSearch).toHaveBeenLastCalledWith("dead");
    expect(screen.getByTestId("location")).toHaveTextContent("/wow-forever/guild?q=dead");
    const list = screen.getByRole("list", { name: "Matching guilds" });
    const links = within(list).getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "/wow-forever/guild/dead-men-walking",
      "/wow-forever/guild/topdeadcenter",
    ]);
    expect(links[0]).toHaveTextContent("Horde");
    expect(links[0]).toHaveTextContent("120 members");
    expect(screen.getByRole("status")).toHaveTextContent('2 guilds matching "dead"');
  });

  it("never searches one letter", () => {
    renderAt("/wow-forever/guild?q=d");
    expect(mockSearch).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Look up your character" })).toBeInTheDocument();
  });

  it("says when nothing matches, and how a guild gets here", () => {
    mockSearch.mockReturnValue(search({ currentData: { query: "zzz", guilds: [], truncated: false } }));
    renderAt("/wow-forever/guild?q=zzz");
    expect(screen.getByRole("status")).toHaveTextContent('No guilds matching "zzz"');
    expect(screen.getByRole("link", { name: "Look up your character" })).toBeInTheDocument();
  });

  it("shows placeholder rows while searching, and a retry when it fails", () => {
    mockSearch.mockReturnValue(search({ isFetching: true }));
    const { unmount } = renderAt("/wow-forever/guild?q=dead");
    expect(screen.getByTestId("guild-finder-skeleton")).toBeInTheDocument();
    unmount();
    const refetch = vi.fn();
    mockSearch.mockReturnValue(search({ isError: true, refetch }));
    renderAt("/wow-forever/guild?q=dead");
    expect(screen.getByText("Couldn't search for guilds.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(refetch).toHaveBeenCalled();
  });
});

describe("the guild page and the finder", () => {
  it("links to the search", () => {
    renderAt("/wow-forever/guild/topdeadcenter");
    expect(screen.getByRole("link", { name: "Find another guild" })).toHaveAttribute("href", "/wow-forever/guild?find=1");
  });

  it("forgets the remembered guild when we no longer have it", () => {
    remember();
    mockGuild.mockReturnValue(guildQuery({ error: { status: 404, data: {} } }));
    renderAt("/wow-forever/guild/topdeadcenter");
    expect(stored()).toBeNull();
  });

  it("keeps it when another guild is missing, or the guild only failed to load", () => {
    remember();
    mockGuild.mockReturnValue(guildQuery({ error: { status: 404, data: {} } }));
    const { unmount } = renderAt("/wow-forever/guild/someone-else");
    unmount();
    mockGuild.mockReturnValue(guildQuery({ error: { status: 500, data: {} } }));
    renderAt("/wow-forever/guild/topdeadcenter");
    expect(stored()).toEqual(REMEMBERED);
  });
});

describe("guild finder helpers", () => {
  it("reads a stored guild, or nothing from a bad one", () => {
    expect(parseRememberedGuild(REMEMBERED)).toEqual(REMEMBERED);
    expect(parseRememberedGuild({ ...REMEMBERED, slug: "" })).toBeNull();
    expect(parseRememberedGuild({ slug: "x", name: "X" })).toBeNull();
    expect(parseRememberedGuild("topdeadcenter")).toBeNull();
    expect(parseRememberedGuild(null)).toBeNull();
  });

  it("says how many matched, and when to type more", () => {
    expect(guildSearchStatus({ ...RESULTS, truncated: true })).toBe(
      'First 2 guilds matching "dead". Type more of the name to narrow it down',
    );
    expect(guildMemberCount(1)).toBe("1 member");
    expect(guildMemberCount(null)).toBeNull();
  });
});
