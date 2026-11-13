/** Every member name on the guild page, in every tab and the banner, opens their character page with a way back to the same URL. */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import GuildSummary from "@/games/wow-forever/components/guild/GuildSummary";
import { GUILD_BACK_LABEL } from "@/games/wow-forever/data/guild/guildConfig";
import { parseBackLink } from "@/games/wow-forever/lib/shared/backLinkState";
import type { GuildCrafter } from "@/games/wow-forever/types/guild/guildCrafter";
import type { GuildMember } from "@/games/wow-forever/types/guild/guildMember";
import type { GuildMemberBaseline } from "@/games/wow-forever/types/guild/guildMemberBaseline";
import type { GuildResponse } from "@/games/wow-forever/types/guild/guildResponse";
import GuildSectionsHarness from "@/test/GuildSectionsHarness";

const CRAFTERS: GuildCrafter[] = [{ slug: "rathgar", name: "Rathgar", surname: "X", class_name: "Warrior", skill: 100, max_skill: 225 }];
vi.mock("@/games/wow-forever/api/wowGuildApi", () => ({
  useSearchGuildRecipesQuery: () => ({
    currentData: {
      query: "linen",
      truncated: false,
      recipes: [{ id: 1, name: "Bolt of Linen Cloth", profession_id: 197, crafters: CRAFTERS }],
    },
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  }),
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

const GUILD: GuildResponse = {
  slug: "topdeadcenter", name: "TopDeadCenter", faction: "alliance", roster_size: 3, roster_updated_at: NOW,
  refresh_failed: false, refresh_failed_at: null, can_refresh: false, refresh_available_at: null, gone: false,
  gains_window_days: 7,
  members: [
    member("rathgar", "Rathgar", "Warrior", { rank: 0, honorable_kills: 1000, killing_blows: 50, dungeons_done: 6, baseline: since({ honorable_kills: 940 }) }),
    member("bigsue", "Big", "Mage", { honorable_kills: 990, killing_blows: 40, dungeons_done: 4, baseline: since({ honorable_kills: 940 }) }),
    member("tiny", "Tiny", "Rogue", { level: 40, honorable_kills: 100, killing_blows: 4, dungeons_done: 1, baseline: since({ honorable_kills: 98 }) }),
  ],
};

const SURFACES: ReadonlyArray<readonly [string, string]> = [
  ["Home (Arena podium and rows, heroes, quests, hot races)", "/wow-forever/topdeadcenter?me=tiny"],
  ["Titles", "/wow-forever/topdeadcenter?tab=titles&me=tiny"],
  ["Who can craft?", "/wow-forever/topdeadcenter?tab=crafting&recipe=linen"],
  ["Roster", "/wow-forever/topdeadcenter?tab=roster"],
];

function CharacterProbe() {
  const state = parseBackLink(useLocation().state);
  return <span data-testid="back">{state ? `${state.backTo}|${state.backLabel}` : "none"}</span>;
}

function renderSurface(url: string, banner: boolean) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route
          path="/wow-forever/topdeadcenter"
          element={banner ? <GuildSummary guild={GUILD} refetch={vi.fn()} /> : <GuildSectionsHarness guild={GUILD} />}
        />
        <Route path="/wow-forever/character/:slug" element={<CharacterProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

function characterLinkCount(): number {
  return screen.queryAllByRole("link").filter((a) => a.getAttribute("href")?.startsWith("/wow-forever/character/")).length;
}

function openCharacterLink(index: number): void {
  const links = screen.getAllByRole("link").filter((a) => a.getAttribute("href")?.startsWith("/wow-forever/character/"));
  fireEvent.click(links[index]);
}

function expectEveryNameCarriesBackState(url: string, banner: boolean): void {
  const { unmount } = renderSurface(url, banner);
  const count = characterLinkCount();
  expect(count).toBeGreaterThan(0);
  unmount();
  for (let i = 0; i < count; i += 1) {
    const view = renderSurface(url, banner);
    openCharacterLink(i);
    expect(screen.getByTestId("back")).toHaveTextContent(`${url}|${GUILD_BACK_LABEL}`);
    view.unmount();
  }
}

describe("member names on the guild page", () => {
  it.each(SURFACES)("%s: every name returns to this exact guild URL", (_surface, url) => {
    expectEveryNameCarriesBackState(url, false);
  });

  it("the banner's guild master returns to this exact guild URL", () => {
    expectEveryNameCarriesBackState("/wow-forever/topdeadcenter?tab=roster", true);
  });
});
