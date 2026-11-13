/**
 * The guild leaderboards' game-style look: the podium split, medals, bars against the leader, class colours,
 * and the category chips that narrow the board picker.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import GuildLeaderboardList from "@/games/wow-forever/components/guild/GuildLeaderboardList";
import GuildLeaderboardPicker from "@/games/wow-forever/components/guild/GuildLeaderboardPicker";
import { CLASS_COLORS } from "@/games/wow-forever/data/guild/classColors";
import { LEADERBOARD_BAR_MIN_PERCENT } from "@/games/wow-forever/data/guild/leaderboardConfig";
import { findBoard } from "@/games/wow-forever/lib/guild/guildLeaderboards";
import { barPercent } from "@/games/wow-forever/lib/guild/leaderboardBar";
import { memberClassStyle } from "@/games/wow-forever/lib/guild/memberClassStyle";
import { ordinal } from "@/games/wow-forever/lib/guild/ordinal";
import { splitPodium } from "@/games/wow-forever/lib/guild/splitPodium";
import type { GuildMember } from "@/games/wow-forever/types/guild/guildMember";
import type { LeaderboardEntry } from "@/games/wow-forever/types/guild/leaderboardEntry";

function member(slug: string, className: string | null = "Mage"): GuildMember {
  return {
    slug, name: slug, surname: "X", class_name: className, level: 60, item_level: null, honorable_kills: null,
    killing_blows: null, deaths_from_players: null, total_kills: null, total_deaths: null, dungeons_done: null,
    exalted_reputations: null, baseline: null, professions: [], rank: 1, refreshed_at: "2026-11-12T00:00:00Z",
  };
}

function entry(slug: string, rank: number, value: number, tied = false, className: string | null = "Mage"): LeaderboardEntry {
  return { member: member(slug, className), value, rank, tied, display: String(value), detail: null };
}

function renderList(ranked: LeaderboardEntry[], extra: { me?: string; showBar?: boolean } = {}) {
  return render(
    <MemoryRouter>
      <GuildLeaderboardList
        ranked={ranked}
        label="Test leaderboard"
        empty="Nobody yet."
        me={extra.me ?? ""}
        viewerNote={null}
        showBar={extra.showBar ?? true}
      />
    </MemoryRouter>,
  );
}

describe("leaderboard look logic", () => {
  it("puts the leading top-3 ranks on the podium, at most three cards, by rank not position", () => {
    const tiedFirst = [entry("a", 1, 9, true), entry("b", 1, 9, true), entry("c", 3, 5), entry("d", 4, 1)];
    expect(splitPodium(tiedFirst).podium.map((e) => e.member.slug)).toEqual(["a", "b", "c"]);
    expect(splitPodium(tiedFirst).rest.map((e) => e.member.slug)).toEqual(["d"]);

    const crowdedSecond = [entry("a", 1, 9), entry("b", 2, 5, true), entry("c", 2, 5, true), entry("d", 2, 5, true)];
    expect(splitPodium(crowdedSecond).podium).toHaveLength(3);
    expect(splitPodium(crowdedSecond).rest.map((e) => e.member.slug)).toEqual(["d"]);

    expect(splitPodium([entry("a", 1, 9)])).toEqual({ podium: [entry("a", 1, 9)], rest: [] });
    expect(splitPodium([entry("a", 4, 9)]).podium).toEqual([]);
  });

  it("sizes bars against the leader, never thinner than the minimum", () => {
    expect(barPercent(50, 200)).toBe(25);
    expect(barPercent(200, 200)).toBe(100);
    expect(barPercent(0, 200)).toBe(LEADERBOARD_BAR_MIN_PERCENT);
    expect(barPercent(0, 0)).toBe(LEADERBOARD_BAR_MIN_PERCENT);
  });

  it("writes places as ordinals", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101].map(ordinal)).toEqual([
      "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "101st",
    ]);
  });

  it("colours a known class, and leaves an unknown one plain", () => {
    expect(memberClassStyle("Priest")).toEqual({ "--c-light": CLASS_COLORS.priest.light, "--c-dark": CLASS_COLORS.priest.dark });
    expect(memberClassStyle("Death Knight")).toBeUndefined();
    expect(memberClassStyle(null)).toBeUndefined();
    // Never plain white text on a white card.
    expect(CLASS_COLORS.priest.light).not.toBe("#FFFFFF");
  });

  it("draws no bars on fewest-first boards or standings", () => {
    expect(findBoard("fewest-deaths").showBar).toBe(false);
    expect(findBoard("faction").showBar).toBe(false);
    expect(findBoard("level").showBar).toBe(true);
    expect(findBoard("levels-gained").showBar).toBe(true);
  });
});

describe("leaderboard list", () => {
  it("is one list in rank order: podium cards first, medals named for screen readers, then rows", () => {
    const { container } = renderList([
      entry("a", 1, 100), entry("b", 2, 50, true), entry("c", 2, 50, true), entry("d", 4, 10, false, "Warlock"),
    ]);
    const items = within(screen.getByRole("list", { name: "Test leaderboard" })).getAllByRole("listitem");
    expect(items.map((li) => li.querySelector("a")?.textContent)).toEqual(["a X", "b X", "c X", "d X"]);
    expect(items[0]).toHaveTextContent("1st place");
    expect(items[1]).toHaveTextContent("2nd place (tied)");
    expect(items[3]).toHaveTextContent("4th place");
    // 1st stands in the middle column on wide screens, 2nd on the left, 3rd on the right; rows span all three.
    expect(items[0].className).toContain("sm:col-start-2");
    expect(items[1].className).toContain("sm:col-start-1");
    expect(items[2].className).toContain("sm:col-start-3");
    expect(items[3].className).toContain("sm:col-span-3");
    // A Warlock's name carries its class colour.
    expect(within(items[3]).getByRole("link")).toHaveStyle({ "--c-light": CLASS_COLORS.warlock.light });
    expect(container.querySelectorAll("[aria-hidden] > span[style*='width']")).toHaveLength(4);
  });

  it("marks the viewer's podium card, and leaves bars off when the board has none", () => {
    const { container } = renderList([entry("a", 1, 100), entry("b", 2, 50)], { me: "b", showBar: false });
    const mine = screen.getAllByRole("listitem")[1];
    expect(within(mine).getByText("You")).toBeInTheDocument();
    expect(mine.className).toContain("ring-primary");
    expect(mine.className).toContain("bg-primary/10");
    expect(container.querySelectorAll("span[style*='width']")).toHaveLength(0);
  });

  it("pins the viewer under a divider when they rank below what's shown", () => {
    const ranked = Array.from({ length: 12 }, (_, i) => entry(`m${i}`, i + 1, 100 - i));
    renderList(ranked, { me: "m11" });
    expect(screen.getByText("Your rank")).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Your character" })).getByText("You")).toBeInTheDocument();
  });
});

describe("board picker", () => {
  it("shows one category's boards, and a chip picks its first board", () => {
    const onChange = vi.fn();
    render(<GuildLeaderboardPicker board={findBoard("level")} onChange={onChange} />);
    expect(screen.getByRole("button", { name: "Character" })).toHaveAttribute("aria-pressed", "true");
    const options = within(screen.getByLabelText("Rank members by")).getAllByRole("option").map((o) => o.getAttribute("value"));
    expect(options).toEqual(["level", "item-level", "dungeons", "fewest-deaths"]);
    fireEvent.click(screen.getByRole("button", { name: "PvP" }));
    expect(onChange).toHaveBeenCalledWith("honorable-kills");
  });

  it("lists every category as a chip", () => {
    render(<GuildLeaderboardPicker board={findBoard("faction")} onChange={vi.fn()} />);
    expect(within(screen.getByRole("group", { name: "Board category" })).getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Character", "PvP", "Reputation", "This week", "Professions",
    ]);
    expect(screen.getByRole("button", { name: "Reputation" })).toHaveAttribute("aria-pressed", "true");
  });
});
