import { PROFESSION_GROUPS } from "@/games/wow-forever/data/professions/professionPicker";
import { PROFESSION_SKILL_LINES } from "@/games/wow-forever/data/professions/professionSkillLines";
import type { GuildGainField } from "@/games/wow-forever/types/guild/guildGainField";
import type { GuildStatField } from "@/games/wow-forever/types/guild/guildStatField";
import type { LeaderboardBoard } from "@/games/wow-forever/types/guild/leaderboardBoard";

/** The guild page's leaderboard URL params: which board, and whose character to highlight. */
export const LEADERBOARD_PARAMS = { board: "board", me: "me" } as const;

/** Rows shown before "Show all". Members tied with the last one are shown too… */
export const LEADERBOARD_TOP = 10;
/** …unless the tie is this big (the level board once most are 60): then just the first 10, and "Show all". */
export const LEADERBOARD_TIE_LIMIT = 20;
/** Rows of the leaderboard skeleton. */
export const LEADERBOARD_SKELETON_ROWS = 5;

export const LEADERBOARD_SOURCE_KIND = { stat: "stat", gain: "gain", profession: "profession" } as const;

/** The member stats a leaderboard can rank. */
export const GUILD_STAT_FIELDS = {
  level: "level",
  itemLevel: "item_level",
  dungeonsDone: "dungeons_done",
  totalDeaths: "total_deaths",
  honorableKills: "honorable_kills",
  killingBlows: "killing_blows",
  deathsFromPlayers: "deaths_from_players",
  totalKills: "total_kills",
  exaltedReputations: "exalted_reputations",
} as const;

/** The member stats a gains board counts (the baseline carries these). */
export const GUILD_GAIN_FIELDS = {
  level: "level",
  honorableKills: "honorable_kills",
  killingBlows: "killing_blows",
  totalKills: "total_kills",
  dungeonsDone: "dungeons_done",
} as const;

/** The leaderboards' copy: a gains board's, and every other board's. */
export const LEADERBOARD_COPY = {
  gains: {
    empty:
      "No gains to show yet. We compare each member's latest lookup with an earlier one, so gains appear once a character has been looked up on two different days.",
    viewerUnranked: "Your character has no gain here yet: it needs lookups on two different days, and a gain between them.",
  },
  other: {
    viewerUnranked: "Your character isn't on this board: we have no number for them here.",
  },
} as const;

const GROUP_CHARACTER = "Character";
const GROUP_PVP = "PvP";
const GROUP_REPUTATION = "Reputation";
const GROUP_PROFESSIONS = "Professions";
const GROUP_THIS_WEEK = "This week";

function stat(id: string, label: string, group: string, field: GuildStatField, extra?: Partial<LeaderboardBoard>): LeaderboardBoard {
  return {
    id, label, group, source: { kind: LEADERBOARD_SOURCE_KIND.stat, field }, ascending: false, maxLevelOnly: false, ...extra,
  };
}

const STAT_BOARDS: readonly LeaderboardBoard[] = [
  stat("level", "Level", GROUP_CHARACTER, GUILD_STAT_FIELDS.level),
  // Item level mostly sorts people by level below the cap.
  stat("item-level", "Item level (level 60)", GROUP_CHARACTER, GUILD_STAT_FIELDS.itemLevel, { maxLevelOnly: true }),
  stat("dungeons", "Dungeons cleared", GROUP_CHARACTER, GUILD_STAT_FIELDS.dungeonsDone),
  // Every death counts (mobs, falls, players): a fresh alt would win below the cap.
  stat("fewest-deaths", "Fewest deaths (level 60)", GROUP_CHARACTER, GUILD_STAT_FIELDS.totalDeaths, {
    ascending: true, maxLevelOnly: true,
  }),
  stat("honorable-kills", "Honorable kills", GROUP_PVP, GUILD_STAT_FIELDS.honorableKills),
  stat("killing-blows", "Killing blows", GROUP_PVP, GUILD_STAT_FIELDS.killingBlows),
  stat("deaths-to-players", "Deaths to players", GROUP_PVP, GUILD_STAT_FIELDS.deathsFromPlayers),
  stat("total-kills", "Total kills", GROUP_PVP, GUILD_STAT_FIELDS.totalKills),
  stat("exalted", "Exalted reputations", GROUP_REPUTATION, GUILD_STAT_FIELDS.exaltedReputations),
];

function gain(id: string, label: string, field: GuildGainField): LeaderboardBoard {
  return {
    id, label, group: GROUP_THIS_WEEK, source: { kind: LEADERBOARD_SOURCE_KIND.gain, field }, ascending: false, maxLevelOnly: false,
  };
}

const GAIN_BOARDS: readonly LeaderboardBoard[] = [
  gain("levels-gained", "Levels gained", GUILD_GAIN_FIELDS.level),
  gain("dungeons-gained", "New dungeon clears", GUILD_GAIN_FIELDS.dungeonsDone),
  gain("honorable-kills-gained", "Honorable kills gained", GUILD_GAIN_FIELDS.honorableKills),
  gain("killing-blows-gained", "Killing blows gained", GUILD_GAIN_FIELDS.killingBlows),
  gain("total-kills-gained", "Total kills gained", GUILD_GAIN_FIELDS.totalKills),
];

const PROFESSION_BOARDS: readonly LeaderboardBoard[] = PROFESSION_GROUPS.flatMap((group) =>
  group.options.map((option) => ({
    id: `prof-${option.id}`,
    label: option.label,
    group: GROUP_PROFESSIONS,
    source: { kind: LEADERBOARD_SOURCE_KIND.profession, professionId: PROFESSION_SKILL_LINES[option.id] },
    ascending: false,
    maxLevelOnly: false,
  })),
);

/** Every board, in picker order. The first is the default. */
export const LEADERBOARDS: readonly LeaderboardBoard[] = [...STAT_BOARDS, ...GAIN_BOARDS, ...PROFESSION_BOARDS];
