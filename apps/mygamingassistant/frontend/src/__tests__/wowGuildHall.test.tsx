/**
 * The guild page's fun sections, rendered: the banner, this week's heroes, your quests (and the nudge without
 * `?me=`), hot races, the Hall of Titles' medallions, the Arena's champion ribbon, and the roll call, each in its tab.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import GuildSummary from "@/games/wow-forever/components/guild/GuildSummary";
import GuildTitleMedallion from "@/games/wow-forever/components/guild/GuildTitleMedallion";
import { CLASS_COLORS } from "@/games/wow-forever/data/guild/classColors";
import type { GuildMember } from "@/games/wow-forever/types/guild/guildMember";
import type { GuildMemberBaseline } from "@/games/wow-forever/types/guild/guildMemberBaseline";
import type { GuildResponse } from "@/games/wow-forever/types/guild/guildResponse";
import GuildSectionsHarness from "@/test/GuildSectionsHarness";
import { Swords } from "lucide-react";

vi.mock("@/games/wow-forever/api/wowGuildApi", () => ({
  useSearchGuildRecipesQuery: () => ({ data: undefined, error: undefined, isFetching: false, refetch: vi.fn() }),
}));

const NOW = new Date(Date.now() - 3_600_000).toISOString();

function since(extra: Partial<GuildMemberBaseline>): GuildMemberBaseline {
  return { day: "2026-11-05", level: null, honorable_kills: null, killing_blows: null, total_kills: null, dungeons_done: null, ...extra };
}

function member(slug: string, name: string, className: string, extra: Partial<GuildMember>): GuildMember {
  return {
    slug, name, surname: "X", class_name: className, level: 60, item_level: null, honorable_kills: null, killing_blows: null,
    deaths_from_players: null, total_kills: null, total_deaths: null, dungeons_done: null, exalted_reputations: null,
    baseline: null, professions: [], rank: 3, refreshed_at: NOW, ...extra,
  };
}

const MEMBERS: GuildMember[] = [
  member("rathgar", "Rathgar", "Warrior", {
    rank: 0, honorable_kills: 1000, killing_blows: 50, dungeons_done: 6, baseline: since({ honorable_kills: 940 }),
  }),
  member("bigsue", "Big", "Mage", { honorable_kills: 990, killing_blows: 40, dungeons_done: 4, baseline: since({ honorable_kills: 940 }) }),
  member("tiny", "Tiny", "Rogue", { level: 40, honorable_kills: 100, killing_blows: 4, dungeons_done: 1, baseline: since({ honorable_kills: 98 }) }),
];

const GUILD: GuildResponse = {
  slug: "topdeadcenter", name: "TopDeadCenter", faction: "alliance", roster_size: 4, roster_updated_at: NOW,
  refresh_failed: false, refresh_failed_at: null, can_refresh: false, refresh_available_at: null, gone: false,
  gains_window_days: 7, members: MEMBERS,
};

function renderSections(search = "") {
  return render(
    <MemoryRouter initialEntries={[`/wow-forever/topdeadcenter${search}`]}>
      <GuildSectionsHarness guild={GUILD} />
    </MemoryRouter>,
  );
}

describe("the banner", () => {
  it("shows the faction, the big name, the guild master in class colour, and the three totals", () => {
    render(<MemoryRouter><GuildSummary guild={GUILD} refetch={vi.fn()} /></MemoryRouter>);
    const banner = screen.getByRole("region", { name: "Guild" });
    expect(within(banner).getByText("Alliance")).toBeInTheDocument();
    expect(within(banner).getByText("3 of 4 members shown")).toBeInTheDocument();
    expect(within(banner).getByText("<TopDeadCenter>")).toBeInTheDocument();
    expect(within(banner).getByRole("link", { name: "Rathgar X" })).toHaveStyle({ "--c-dark": CLASS_COLORS.warrior.dark });
    const chips = within(within(banner).getByRole("list", { name: "Guild totals" })).getAllByRole("listitem");
    expect(chips.map((c) => c.textContent)).toEqual(["2,090 honorable kills", "11 dungeon clears", "2 of 3 at level 60"]);
  });

  it("is red for the Horde, and plain slate for a faction it doesn't know", () => {
    const { container, rerender } = render(<MemoryRouter><GuildSummary guild={{ ...GUILD, faction: "horde" }} refetch={vi.fn()} /></MemoryRouter>);
    expect(container.querySelector(".from-\\[\\#5c0a0a\\]")).not.toBeNull();
    rerender(<MemoryRouter><GuildSummary guild={{ ...GUILD, faction: "other" }} refetch={vi.fn()} /></MemoryRouter>);
    expect(container.querySelector(".from-slate-800")).not.toBeNull();
  });
});

describe("the fun sections", () => {
  it("sit in tabs: Home (the Arena, then heroes, your quests, hot races) opens first, then titles, crafting and the roster", () => {
    renderSections("?me=tiny");
    const tabs = within(screen.getByRole("tablist", { name: "Guild sections" })).getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Home", "Titles", "Who can craft?", "Roster"]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    const panel = screen.getByRole("tabpanel", { name: "Home" });
    expect(within(panel).getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["The Arena", "This week's heroes", "Your quests", "Hot races"]);
    // Only the open tab renders.
    expect(screen.queryByRole("region", { name: "Hall of Titles" })).toBeNull();
    expect(screen.queryByText("Roll call (3)")).toBeNull();
  });

  it("switches tabs by click and by arrow keys, only the open tab in the Tab order", () => {
    renderSections();
    fireEvent.click(screen.getByRole("tab", { name: "Roster" }));
    expect(screen.getByRole("tabpanel", { name: "Roster" })).toHaveTextContent("Roll call (3)");
    expect(screen.getByRole("tab", { name: "Roster" })).toHaveAttribute("tabIndex", "0");
    expect(screen.getByRole("tab", { name: "Home" })).toHaveAttribute("tabIndex", "-1");
    fireEvent.keyDown(screen.getByRole("tab", { name: "Roster" }), { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Home" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Home" })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("tab", { name: "Home" }), { key: "End" });
    expect(screen.getByRole("region", { name: /Roll call/ })).toBeInTheDocument();
  });

  it("heroes: one card per gains board with the leader, '+N', a chase hint, and a rolling window (never 'resets')", () => {
    renderSections();
    const section = screen.getByRole("region", { name: "This week's heroes" });
    expect(section).toHaveTextContent("Biggest gains over the last 7 days");
    expect(section.textContent).not.toMatch(/reset/i);
    const cards = within(within(section).getByRole("list", { name: "This week's heroes" })).getAllByRole("listitem");
    expect(cards).toHaveLength(1);
    expect(cards[0]).toHaveTextContent("Honorable kills gained");
    expect(cards[0]).toHaveTextContent("+60");
    expect(within(cards[0]).getByRole("link")).toHaveTextContent("Rathgar X");
    expect(cards[0]).toHaveTextContent("Big X is 10 HKs behind");
  });

  it("hot races: duel cards with both names, a VS, and how far apart they are", () => {
    renderSections();
    const duels = within(screen.getByRole("list", { name: "Hot races" })).getAllByRole("listitem");
    expect(duels[0]).toHaveTextContent("Honorable kills · Bloodletter");
    expect(within(duels[0]).getAllByRole("link").map((a) => a.textContent)).toEqual(["Rathgar X", "Big X"]);
    expect(duels[0]).toHaveTextContent("10 HKs apart");
    expect(duels[0]).toHaveTextContent("VS");
  });

  it("hot races: a board whose title wasn't given out (too few ranked) names no title", () => {
    render(
      <MemoryRouter>
        <GuildSectionsHarness guild={{ ...GUILD, members: MEMBERS.slice(0, 2) }} />
      </MemoryRouter>,
    );
    const duels = within(screen.getByRole("list", { name: "Hot races" })).getAllByRole("listitem");
    const hks = duels.find((d) => d.textContent?.startsWith("Honorable kills"));
    expect(hks).toBeDefined();
    expect(hks?.textContent).not.toContain("Bloodletter");
  });

  it("your quests: the viewer's closest steals; a nudge without ?me=; nothing for a stranger", () => {
    const { unmount } = renderSections("?me=tiny");
    const quests = within(screen.getByRole("list", { name: "Your quests" })).getAllByRole("listitem");
    expect(quests.length).toBeGreaterThan(0);
    expect(quests.length).toBeLessThanOrEqual(3);
    expect(quests.map((q) => q.textContent).join(" | ")).toContain("more HKs to take Bloodletter from Rathgar X");
    unmount();

    const nudge = renderSections();
    expect(screen.queryByRole("region", { name: "Your quests" })).toBeNull();
    expect(screen.getByText(/Want your own quests\?/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Look up your character" })).toHaveAttribute("href", "/wow-forever/character");
    nudge.unmount();

    renderSections("?me=stranger");
    expect(screen.queryByRole("region", { name: "Your quests" })).toBeNull();
    expect(screen.queryByText(/Want your own quests\?/)).toBeNull();
  });

  it("the Hall of Titles: flavour, rarity and the challenger on each card", () => {
    renderSections("?tab=titles");
    const hall = within(screen.getByRole("region", { name: "Hall of Titles" }));
    const bloodletter = hall.getAllByRole("listitem").find((li) => li.textContent?.includes("Bloodletter"));
    expect(bloodletter).toHaveTextContent("Legendary");
    expect(bloodletter).toHaveTextContent("The battlemasters know this name by heart.");
    expect(bloodletter).toHaveTextContent("Closest challenger: Big X, 10 HKs behind");
    expect(hall.getByText(/Not in-game titles/)).toBeInTheDocument();
  });

  it("the Arena's podium: a champion ribbon on 1st only, class-coloured top borders", () => {
    renderSections("?board=honorable-kills");
    const podium = within(screen.getByRole("list", { name: "Honorable kills leaderboard" })).getAllByRole("listitem");
    expect(within(podium[0]).getByText("Champion")).toBeInTheDocument();
    expect(within(podium[1]).queryByText("Champion")).toBeNull();
    expect(podium[0].className).toContain("border-t-[color:var(--c-light,transparent)]");
    expect(podium[0]).toHaveStyle({ "--c-light": CLASS_COLORS.warrior.light });
  });

  it("the roll call is the Roster tab: a heading with the count, then the member list", () => {
    renderSections("?tab=roster");
    const rollCall = screen.getByRole("region", { name: "Roll call (3)" });
    expect(within(rollCall).getByText("Showing 3 of 3 members")).toBeInTheDocument();
  });
});

describe("a title medallion", () => {
  it("sweeps a shine across epic and legendary ones only, and holds it still for reduced motion", () => {
    const { container, rerender } = render(<GuildTitleMedallion icon={Swords} tier="epic" size="card" />);
    const shine = container.querySelector("span > span");
    expect(shine?.className).toContain("animate-[guild-shine_3.5s_ease-in-out_infinite]");
    expect(shine?.className).toContain("motion-reduce:animate-none");
    rerender(<GuildTitleMedallion icon={Swords} tier="legendary" size="inline" />);
    expect(container.querySelector("span > span")).not.toBeNull();
    rerender(<GuildTitleMedallion icon={Swords} tier="rare" size="card" />);
    expect(container.querySelector("span > span")).toBeNull();
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });
});
