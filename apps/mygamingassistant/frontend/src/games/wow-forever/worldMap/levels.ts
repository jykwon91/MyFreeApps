/**
 * Level rules for quests and dungeons.
 *
 * The colours are the game's own quest-log colours: red (5+ levels above
 * you), orange (3-4 above), yellow (about your level), green (below you but
 * still worth experience), grey (too low for experience). The grey cut-off
 * is Classic's formula.
 */
import { FACTION, type MapPoi, type PlayerFaction, type QuestInfo } from "@/games/wow-forever/types/worldMap";

export const LEVEL_BAND = {
  red: "red",
  orange: "orange",
  yellow: "yellow",
  green: "green",
  grey: "grey",
} as const;
export type LevelBand = (typeof LEVEL_BAND)[keyof typeof LEVEL_BAND];

export const LEVEL_BAND_TEXT_CLASS: Readonly<Record<LevelBand, string>> = {
  red: "text-red-600 dark:text-red-400",
  orange: "text-orange-600 dark:text-orange-400",
  yellow: "text-yellow-700 dark:text-yellow-300",
  green: "text-green-700 dark:text-green-400",
  grey: "text-muted-foreground",
};

export const LEVEL_BAND_LABEL: Readonly<Record<LevelBand, string>> = {
  red: "far above your level",
  orange: "above your level",
  yellow: "your level",
  green: "below your level",
  grey: "too low for experience",
};

/** A quest can be picked up at most this many levels before its minimum shows it. */
export const QUEST_LOOKAHEAD_LEVELS = 2;

/** Highest level that is grey (no experience) for a player of `level`. */
export function greyLevel(level: number): number {
  if (level <= 5) return 0;
  if (level <= 39) return level - Math.floor(level / 10) - 5;
  if (level <= 59) return level - Math.floor(level / 5) - 1;
  return level - 9;
}

export function levelBand(targetLevel: number, playerLevel: number): LevelBand {
  const diff = targetLevel - playerLevel;
  if (diff >= 5) return LEVEL_BAND.red;
  if (diff >= 3) return LEVEL_BAND.orange;
  if (diff >= -2) return LEVEL_BAND.yellow;
  if (targetLevel > greyLevel(playerLevel)) return LEVEL_BAND.green;
  return LEVEL_BAND.grey;
}

/**
 * Quests the player could take: their faction (or both), their class (or
 * every class) and — when a level is set — a minimum level no more than
 * two above theirs.
 */
export function questsFor(
  quests: readonly QuestInfo[],
  faction: PlayerFaction,
  classId: string,
  level: number | null,
): QuestInfo[] {
  return quests
    .filter(
      (q) =>
        (q.side === faction || q.side === FACTION.neutral) &&
        (q.classes.length === 0 || q.classes.includes(classId)) &&
        (level === null || q.minLevel <= level + QUEST_LOOKAHEAD_LEVELS),
    )
    .sort((a, b) => a.level - b.level || a.title.localeCompare(b.title));
}

/** The dungeon's Forever level: "Level 17" or "Levels 52-60". */
export function instanceLevelText(poi: Pick<MapPoi, "levelMin" | "levelMax">): string {
  const min = poi.levelMin ?? 0;
  const max = poi.levelMax ?? min;
  return min === max ? `Level ${min}` : `Levels ${min}–${max}`;
}

/**
 * A dungeon's colour for the player: by its level, red when the entrance
 * won't let them in yet. Null when its level isn't known (a captured
 * entrance with no Classic match).
 */
export function instanceBand(poi: Pick<MapPoi, "levelMin" | "requiredLevel">, playerLevel: number): LevelBand | null {
  if (playerLevel < (poi.requiredLevel ?? 0)) return LEVEL_BAND.red;
  if (poi.levelMin === undefined) return null;
  return levelBand(poi.levelMin, playerLevel);
}
