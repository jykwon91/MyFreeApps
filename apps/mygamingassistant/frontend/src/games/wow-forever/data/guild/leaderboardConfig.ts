import { PROFESSION_GROUPS } from "@/games/wow-forever/data/professions/professionPicker";
import { PROFESSION_SKILL_LINES } from "@/games/wow-forever/data/professions/professionSkillLines";
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

export const LEADERBOARD_SOURCE_KIND = { stat: "stat", profession: "profession" } as const;

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

const GROUP_CHARACTER = "Character";
const GROUP_PVP = "PvP";
const GROUP_REPUTATION = "Reputation";
const GROUP_PROFESSIONS = "Professions";

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
export const LEADERBOARDS: readonly LeaderboardBoard[] = [...STAT_BOARDS, ...PROFESSION_BOARDS];
