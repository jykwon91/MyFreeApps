/**
 * Guild titles: who leads each board earns its title (ties share it), with the rules that keep
 * a title meaningful, and how titles show by a member's name and in the titles strip.
 */
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import GuildMemberTitles from "@/games/wow-forever/components/guild/GuildMemberTitles";
import GuildTitlesStrip from "@/games/wow-forever/components/guild/GuildTitlesStrip";
import { GUILD_TITLE_COPY, GUILD_TITLE_PROFESSION_FLOOR } from "@/games/wow-forever/data/guild/guildTitles";
import { PROFESSION_SKILL_LINES } from "@/games/wow-forever/data/professions/professionSkillLines";
import { awardGuildTitles, titleTieLimit } from "@/games/wow-forever/lib/guild/guildTitles";
import type { GuildMember } from "@/games/wow-forever/types/guild/guildMember";

function member(slug: string, extra: Partial<GuildMember> = {}): GuildMember {
  return {
    slug, name: slug, surname: "X", class_name: "Mage", level: null, item_level: null, honorable_kills: null,
    killing_blows: null, deaths_from_players: null, total_kills: null, total_deaths: null, dungeons_done: null,
    exalted_reputations: null, baseline: null, professions: [], rank: 1, refreshed_at: "2026-11-12T00:00:00Z", ...extra,
  };
}

function titleNames(members: GuildMember[]): string[] {
  return awardGuildTitles(members).awarded.map((t) => t.title);
}

describe("awarding titles", () => {
  it("gives a board's leader its title, and tied leaders share it", () => {
    const titles = awardGuildTitles([
      member("a", { honorable_kills: 90 }), member("b", { honorable_kills: 90 }), member("c", { honorable_kills: 5 }),
    ]);
    const bloodletter = titles.awarded.find((t) => t.title === "Bloodletter");
    expect(bloodletter?.holders.map((m) => m.slug)).toEqual(["a", "b"]);
    expect(bloodletter?.display).toBe("90");
    expect(titles.bySlug.get("a")?.map((t) => t.title)).toContain("Bloodletter");
    expect(titles.bySlug.get("c")?.map((t) => t.title) ?? []).not.toContain("Bloodletter");
  });

  it("gives nothing for a lead of 0, or a board with fewer than three members on it", () => {
    expect(titleNames([member("a", { honorable_kills: 0 }), member("b", { honorable_kills: 0 }), member("c", { honorable_kills: 0 })]))
      .not.toContain("Bloodletter");
    expect(titleNames([member("a", { honorable_kills: 50 }), member("b", { honorable_kills: 9 }), member("c")]))
      .not.toContain("Bloodletter");
  });

  it("needs a real skill for a profession title", () => {
    const cooks = (best: number) => [
      member("a", { professions: [{ id: PROFESSION_SKILL_LINES.cooking, skill: best, max_skill: 150 }] }),
      member("b", { professions: [{ id: PROFESSION_SKILL_LINES.cooking, skill: 10, max_skill: 75 }] }),
      member("c", { professions: [{ id: PROFESSION_SKILL_LINES.cooking, skill: 1, max_skill: 75 }] }),
    ];
    expect(titleNames(cooks(GUILD_TITLE_PROFESSION_FLOOR - 1))).not.toContain("Hearthcook");
    expect(titleNames(cooks(GUILD_TITLE_PROFESSION_FLOOR))).toContain("Hearthcook");
  });

  it("skips a title when too many tie for it (everyone at 60), and says so", () => {
    expect(titleTieLimit(4)).toBe(3);
    expect(titleTieLimit(40)).toBe(10);
    const at60 = Array.from({ length: 12 }, (_, i) => member(`m${i}`, { level: 60 }));
    const titles = awardGuildTitles(at60);
    expect(titles.awarded.map((t) => t.title)).not.toContain("Trailblazer");
    expect(titles.skipped).toEqual([{ title: "Trailblazer", earnedFor: "highest level" }]);
    // Three tied in a small guild still share it.
    expect(titleNames([member("a", { level: 60 }), member("b", { level: 60 }), member("c", { level: 60 }), member("d", { level: 20 })]))
      .toContain("Trailblazer");
    // Nobody leads when everyone on the board is tied.
    const allTied = awardGuildTitles([member("a", { level: 30 }), member("b", { level: 30 }), member("c", { level: 30 })]);
    expect(allTied.awarded).toEqual([]);
    expect(allTied.skipped.map((s) => s.title)).toEqual(["Trailblazer"]);
  });

  it("counts the tie limit against the board, so a crowd tied at the top gets nothing", () => {
    const hk = (values: number[]) => values.map((v, i) => member(`m${i}`, { honorable_kills: v }));
    // Eight on the board: the limit is 3.
    expect(titleNames(hk([50, 50, 50, 9, 8, 7, 6, 5]))).toContain("Bloodletter");
    const crowd = awardGuildTitles(hk([50, 50, 50, 50, 8, 7, 6, 5]));
    expect(crowd.awarded.map((t) => t.title)).not.toContain("Bloodletter");
    expect(crowd.skipped.map((s) => s.title)).toContain("Bloodletter");
  });

  it("gives no weekly title when nobody gained anything", () => {
    const since = { day: "2026-11-05", level: null, honorable_kills: 40, killing_blows: null, total_kills: null, dungeons_done: null };
    const flat = [0, 1, 2].map((i) => member(`m${i}`, { honorable_kills: 40, baseline: since }));
    const titles = awardGuildTitles(flat);
    expect(titles.awarded.filter((t) => t.weekly)).toEqual([]);
    expect(titles.skipped.map((s) => s.title)).not.toContain("Bloodthirsty");
  });

  it("counts no deaths at 60 as Deathless", () => {
    const titles = awardGuildTitles([
      member("a", { level: 60, total_deaths: 0 }), member("b", { level: 60, total_deaths: 4 }), member("c", { level: 60, total_deaths: 9 }),
      member("d", { level: 59, total_deaths: 0 }),
    ]);
    expect(titles.awarded.find((t) => t.title === "Deathless")?.holders.map((m) => m.slug)).toEqual(["a"]);
  });

  it("orders a member's titles: all-time first, then professions, then this week's", () => {
    const since = { day: "2026-11-05", level: null, honorable_kills: 10, killing_blows: null, total_kills: null, dungeons_done: null };
    const titles = awardGuildTitles([
      member("a", {
        honorable_kills: 90, baseline: since,
        professions: [{ id: PROFESSION_SKILL_LINES.mining, skill: 200, max_skill: 225 }],
      }),
      member("b", { honorable_kills: 20, baseline: since, professions: [{ id: PROFESSION_SKILL_LINES.mining, skill: 80, max_skill: 150 }] }),
      member("c", { honorable_kills: 15, baseline: since, professions: [{ id: PROFESSION_SKILL_LINES.mining, skill: 76, max_skill: 150 }] }),
    ]);
    const mine = titles.bySlug.get("a") ?? [];
    expect(mine.map((t) => t.title)).toEqual(["Bloodletter", "Deepdelver", "Bloodthirsty"]);
    expect(mine.map((t) => t.weekly)).toEqual([false, false, true]);
  });
});

describe("showing titles", () => {
  const titles = awardGuildTitles([
    member("a", { honorable_kills: 90, killing_blows: 30, total_kills: 200 }),
    member("b", { honorable_kills: 20, killing_blows: 3, total_kills: 50 }),
    member("c", { honorable_kills: 15, killing_blows: 1, total_kills: 40 }),
  ]);

  it("shows a member's first title and '+N' for the rest, named in full for screen readers", () => {
    render(<GuildMemberTitles titles={titles.bySlug.get("a")} />);
    expect(screen.getByText("Bloodletter")).toBeInTheDocument();
    expect(screen.getByText("Deathblow")).not.toBeVisible();
    expect(screen.getAllByText(/Guild title:/)[0].parentElement).toHaveTextContent("Guild title: Bloodletter (most honorable kills)");
    const more = screen.getByRole("button", { name: "Show 2 more guild titles" });
    expect(more).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(more);
    expect(screen.getByText("Deathblow")).toBeVisible();
    expect(screen.getByText("Reaper")).toBeVisible();
    expect(screen.getByRole("button", { name: "Show fewer guild titles" })).toHaveAttribute("aria-expanded", "true");
    // The button controls the extra titles, hidden until opened.
    expect(document.getElementById(more.getAttribute("aria-controls") ?? "")).toHaveTextContent("Guild title: Deathblow (most killing blows)Guild title: Reaper (most total kills)");
  });

  it("names one more title in the singular", () => {
    const two = awardGuildTitles([
      member("a", { honorable_kills: 90, killing_blows: 30 }), member("b", { honorable_kills: 20, killing_blows: 3 }),
      member("c", { honorable_kills: 15, killing_blows: 1 }),
    ]);
    render(<GuildMemberTitles titles={two.bySlug.get("a")} />);
    expect(screen.getByRole("button", { name: "Show 1 more guild title" })).toHaveTextContent("+1");
  });

  it("shows nothing for a member without titles", () => {
    const { container } = render(<GuildMemberTitles titles={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists every title with its holders in the strip, and marks this week's", () => {
    const since = { day: "2026-11-05", level: null, honorable_kills: 10, killing_blows: null, total_kills: null, dungeons_done: null };
    const weekly = awardGuildTitles([
      member("a", { honorable_kills: 90, baseline: since }), member("b", { honorable_kills: 20, baseline: since }),
      member("c", { honorable_kills: 15, baseline: since }),
    ]);
    render(<MemoryRouter><GuildTitlesStrip titles={weekly} /></MemoryRouter>);
    const list = screen.getByRole("list", { name: "Titles and who holds them" });
    const cards = within(list).getAllByRole("listitem");
    expect(cards[0]).toHaveTextContent("Bloodletter");
    expect(within(cards[0]).getByRole("link")).toHaveTextContent("a X");
    expect(cards[1]).toHaveTextContent(`${GUILD_TITLE_COPY.weekly}:Bloodthirsty`);
    expect(cards[1]).toHaveTextContent("most honorable kills gained · +80");
    expect(screen.getByText(GUILD_TITLE_COPY.note)).toBeInTheDocument();
  });

  it("says when there are no titles yet", () => {
    render(<MemoryRouter><GuildTitlesStrip titles={awardGuildTitles([member("a"), member("b")])} /></MemoryRouter>);
    expect(screen.getByText(GUILD_TITLE_COPY.empty)).toBeInTheDocument();
  });

  it("notes a title skipped for a big tie", () => {
    const at60 = Array.from({ length: 12 }, (_, i) => member(`m${i}`, { level: 60 }));
    render(<MemoryRouter><GuildTitlesStrip titles={awardGuildTitles(at60)} /></MemoryRouter>);
    expect(screen.getByText(GUILD_TITLE_COPY.skipped("Trailblazer", "highest level"))).toBeInTheDocument();
  });
});
