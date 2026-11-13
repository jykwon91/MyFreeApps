/**
 * The guild page's fun logic: title tiers, the chase hints ("12 HKs behind"), this week's heroes, hot races
 * (smallest relative gap), the viewer's quests, and the banner's totals. All pure functions.
 */
import { describe, expect, it } from "vitest";
import { GUILD_TITLES } from "@/games/wow-forever/data/guild/guildTitles";
import { GUILD_TITLE_TIER_STYLES, GUILD_TITLE_TIERS } from "@/games/wow-forever/data/guild/titleTiers";
import { challengerLine, heroHint, moreUnits, titleChallenger, unitCount } from "@/games/wow-forever/lib/guild/guildChase";
import { weeklyHeroes } from "@/games/wow-forever/lib/guild/guildHeroes";
import { hotRaces } from "@/games/wow-forever/lib/guild/guildHotRaces";
import { myQuests } from "@/games/wow-forever/lib/guild/guildQuests";
import { findBoard, rankBoard } from "@/games/wow-forever/lib/guild/guildLeaderboards";
import { awardGuildTitles } from "@/games/wow-forever/lib/guild/guildTitles";
import { guildTotals } from "@/games/wow-forever/lib/guild/guildTotals";
import type { GuildMember } from "@/games/wow-forever/types/guild/guildMember";
import type { GuildMemberBaseline } from "@/games/wow-forever/types/guild/guildMemberBaseline";

function member(slug: string, extra: Partial<GuildMember> = {}): GuildMember {
  return {
    slug, name: slug, surname: "X", class_name: "Mage", level: null, item_level: null, honorable_kills: null,
    killing_blows: null, deaths_from_players: null, total_kills: null, total_deaths: null, dungeons_done: null,
    exalted_reputations: null, baseline: null, professions: [], rank: 1, refreshed_at: "2026-11-12T00:00:00Z", ...extra,
  };
}

function since(extra: Partial<GuildMemberBaseline>): GuildMemberBaseline {
  return { day: "2026-11-05", level: null, honorable_kills: null, killing_blows: null, total_kills: null, dungeons_done: null, ...extra };
}

describe("title tiers", () => {
  it("gives every title a rarity and a line of flavour", () => {
    for (const def of Object.values(GUILD_TITLES)) {
      expect(Object.values(GUILD_TITLE_TIERS)).toContain(def.tier);
      expect(def.flavor.length).toBeGreaterThan(10);
    }
  });

  it("puts the hardest all-time titles on top, weekly ones in the middle, professions below, jokes at the bottom", () => {
    expect(GUILD_TITLES["fewest-deaths"].tier).toBe("legendary");
    expect(GUILD_TITLES["honorable-kills"].tier).toBe("legendary");
    expect(GUILD_TITLES["total-kills"].tier).toBe("epic");
    expect(GUILD_TITLES["honorable-kills-gained"].tier).toBe("rare");
    expect(GUILD_TITLES["prof-cooking"].tier).toBe("uncommon");
    expect(GUILD_TITLES["deaths-to-players"].tier).toBe("poor");
    expect(GUILD_TITLES["deaths-to-players"].title).toBe("Gank Magnet");
  });

  it("ranks the tiers poor < uncommon < rare < epic < legendary and shines only the top two", () => {
    const tiers = Object.values(GUILD_TITLE_TIERS);
    const ranks = tiers.map((t) => GUILD_TITLE_TIER_STYLES[t].rank);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(new Set(ranks).size).toBe(tiers.length);
    expect(tiers.filter((t) => GUILD_TITLE_TIER_STYLES[t].shine)).toEqual(["epic", "legendary"]);
  });

  it("orders awarded titles rarest first", () => {
    const titles = awardGuildTitles([
      member("a", { honorable_kills: 90, killing_blows: 30, baseline: since({ honorable_kills: 10 }) }),
      member("b", { honorable_kills: 20, killing_blows: 3, baseline: since({ honorable_kills: 10 }) }),
      member("c", { honorable_kills: 15, killing_blows: 1, baseline: since({ honorable_kills: 10 }) }),
    ]);
    expect(titles.awarded.map((t) => t.tier)).toEqual(["legendary", "epic", "rare"]);
  });
});

describe("chase hints", () => {
  const hk = findBoard("honorable-kills");
  const ranked = rankBoard([member("a", { honorable_kills: 100 }), member("b", { honorable_kills: 88 }), member("c", { honorable_kills: 88 })], hk);

  it("counts a board's own unit, with the right noun", () => {
    expect(unitCount("honorable-kills", 12)).toBe("12 HKs");
    expect(unitCount("levels-gained", 1)).toBe("1 level");
    expect(unitCount("prof-mining", 1200)).toBe("1,200 skill points");
    expect(moreUnits("honorable-kills", 17)).toBe("17 more HKs");
    expect(moreUnits("dungeons-gained", 1)).toBe("1 more dungeon clear");
  });

  it("finds the first member below the leaders, and says how far behind", () => {
    const challenger = titleChallenger(ranked);
    expect(challenger?.member.slug).toBe("b");
    expect(challenger?.gap).toBe(12);
    expect(challengerLine("honorable-kills", challenger!)).toBe("Closest challenger: b X, 12 HKs behind");
    expect(titleChallenger(ranked.slice(0, 1))).toBeNull();
    expect(titleChallenger([])).toBeNull();
  });

  it("tells the leader who's chasing, a dead heat at 0, and an open crown with no rival", () => {
    expect(heroHint("honorable-kills", ranked[0], ranked[1])).toBe("b X is 12 HKs behind — defend the crown!");
    expect(heroHint("honorable-kills", ranked[1], ranked[2])).toBe("Dead heat with c X!");
    expect(heroHint("honorable-kills", ranked[0], null)).toMatch(/Nobody else is on the board/);
  });
});

describe("this week's heroes", () => {
  it("is the leader of each gains board with anyone on it, in board order, with a chase hint", () => {
    const heroes = weeklyHeroes([
      member("a", { honorable_kills: 50, level: 30, baseline: since({ honorable_kills: 10, level: 29 }) }),
      member("b", { honorable_kills: 48, level: 20, baseline: since({ honorable_kills: 20, level: 20 }) }),
    ]);
    expect(heroes.map((h) => h.board.id)).toEqual(["levels-gained", "honorable-kills-gained"]);
    expect(heroes[0].leader.display).toBe("+1");
    expect(heroes[0].hint).toMatch(/Nobody else is on the board/);
    expect(heroes[1].leader.member.slug).toBe("a");
    expect(heroes[1].leader.display).toBe("+40");
    expect(heroes[1].hint).toBe("b X is 12 HKs behind — defend the crown!");
  });

  it("is empty when nobody gained anything", () => {
    expect(weeklyHeroes([member("a", { honorable_kills: 5, baseline: since({ honorable_kills: 5 }) }), member("b")])).toEqual([]);
  });
});

describe("hot races", () => {
  const members = [
    member("a", { honorable_kills: 1000, killing_blows: 50, total_kills: 100, dungeons_done: 9, exalted_reputations: 8 }),
    member("b", { honorable_kills: 990, killing_blows: 40, total_kills: 60, dungeons_done: 3, exalted_reputations: 8 }),
  ];

  it("lists the smallest relative gaps first, up to three, so 10 in 1,000 beats 10 in 50", () => {
    const races = hotRaces(members);
    expect(races.map((r) => r.board.id)).toEqual(["honorable-kills", "killing-blows", "total-kills"]);
    expect(races[0].gap).toBe(10);
    expect(races[0].relativeGap).toBeCloseTo(0.01);
    expect(races[0].leader.member.slug).toBe("a");
    expect(races[0].runnerUp.member.slug).toBe("b");
    expect(hotRaces(members, 1)).toHaveLength(1);
  });

  it("leaves out a dead heat (both lead), a runner-up far behind, and a board without a real lead", () => {
    const ids = hotRaces(members, 10).map((r) => r.board.id);
    expect(ids).not.toContain("exalted");
    expect(ids).not.toContain("dungeons");
    expect(hotRaces([member("a", { honorable_kills: 0 }), member("b", { honorable_kills: 0 })])).toEqual([]);
    expect(hotRaces([member("a", { honorable_kills: 9 })])).toEqual([]);
  });
});

describe("your quests", () => {
  const members = [
    member("a", { honorable_kills: 100, killing_blows: 10, total_kills: 300 }),
    member("b", { honorable_kills: 90, killing_blows: 9, total_kills: 100 }),
    member("c", { honorable_kills: 80, killing_blows: 2, total_kills: 90 }),
  ];
  const titles = awardGuildTitles(members);

  it("lists the viewer's closest steals first, in the board's own words", () => {
    const quests = myQuests(members, titles, "c");
    expect(quests.map((q) => q.title.title)).toEqual(["Bloodletter", "Reaper", "Deathblow"]);
    expect(quests[0].text).toBe("21 more HKs to take Bloodletter from a X");
    expect(quests[1].text).toBe("211 more kills to take Reaper from a X");
  });

  it("keeps three, skips titles the viewer holds, and has nothing without a viewer or for a stranger", () => {
    expect(myQuests(members, titles, "c", 2)).toHaveLength(2);
    expect(myQuests(members, titles, "a")).toEqual([]);
    expect(myQuests(members, titles, "")).toEqual([]);
    expect(myQuests(members, titles, "nobody")).toEqual([]);
  });

  it("turns a fewest-first board around: the leader has to slip, there's nothing to grind", () => {
    const at60 = [
      member("a", { level: 60, total_deaths: 2 }), member("b", { level: 60, total_deaths: 5 }), member("c", { level: 60, total_deaths: 9 }),
    ];
    const [quest] = myQuests(at60, awardGuildTitles(at60), "c");
    expect(quest.title.title).toBe("Deathless");
    expect(quest.text).toBe("a X leads Deathless by 7 deaths. Pray they meet the Spirit Healer.");
  });

  it("names a shared lead as 'and N others'", () => {
    const shared = [
      member("a", { honorable_kills: 100 }), member("b", { honorable_kills: 100 }), member("c", { honorable_kills: 50 }), member("d", { honorable_kills: 10 }),
    ];
    const [quest] = myQuests(shared, awardGuildTitles(shared), "c");
    expect(quest.text).toBe("51 more HKs to take Bloodletter from a X and 1 other");
  });
});

describe("guild totals", () => {
  it("adds up honorable kills and dungeon clears (a number we don't have is nothing) and counts the level 60s", () => {
    expect(
      guildTotals([
        member("a", { honorable_kills: 1200, dungeons_done: 5, level: 60 }),
        member("b", { honorable_kills: null, dungeons_done: 2, level: 59 }),
        member("c", { honorable_kills: 34, dungeons_done: null, level: 60 }),
      ]),
    ).toEqual({ honorableKills: 1234, dungeonClears: 7, atCap: 2, members: 3 });
    expect(guildTotals([])).toEqual({ honorableKills: 0, dungeonClears: 0, atCap: 0, members: 0 });
  });
});
