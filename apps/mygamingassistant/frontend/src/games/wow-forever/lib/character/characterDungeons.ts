import { DUNGEON_STATUS } from "@/games/wow-forever/data/character/characterDungeonStatus";
import { DUNGEON_FIT_LEVEL_SPREAD, DUNGEON_UNTRACKED_LABEL } from "@/games/wow-forever/data/character/characterDungeonsConfig";
import { dungeonPageHref } from "@/games/wow-forever/lib/dungeons/dungeonHref";
import { dungeonSlug } from "@/games/wow-forever/lib/dungeons/dungeonSlug";
import { formatCount } from "@/games/wow-forever/lib/character/formatCount";
import type { CharacterDungeon } from "@/games/wow-forever/types/character/characterDungeon";
import type { CharacterDungeonStatus } from "@/games/wow-forever/types/character/characterDungeonStatus";
import type { CharacterDungeons } from "@/games/wow-forever/types/character/characterDungeons";

export function dungeonStatus(dungeon: CharacterDungeon): CharacterDungeonStatus {
  if (dungeon.kills === null) return DUNGEON_STATUS.UNTRACKED;
  if (dungeon.kills > 0) return DUNGEON_STATUS.DONE;
  return DUNGEON_STATUS.NOT_DONE;
}

/** The section's line: "8 of 26 tracked done"; "Couldn't load" when Blizzard failed. */
export function dungeonsSummary(dungeons: CharacterDungeons | null): string {
  if (dungeons === null) return "Couldn't load";
  const tracked = dungeons.dungeons.filter((d) => d.kills !== null);
  const done = tracked.filter((d) => dungeonStatus(d) === DUNGEON_STATUS.DONE);
  return `${done.length} of ${tracked.length} tracked done`;
}

/** "Scarlet Monastery: Cathedral", or just the name. */
export function dungeonTitle(dungeon: CharacterDungeon): string {
  if (dungeon.wing === null) return dungeon.name;
  return `${dungeon.name}: ${dungeon.wing}`;
}

/** "Level 16", or "Levels 13–20" for a range. */
function dungeonLevelText(dungeon: CharacterDungeon): string {
  if (dungeon.level_min === dungeon.level_max) return `Level ${dungeon.level_min}`;
  return `Levels ${dungeon.level_min}–${dungeon.level_max}`;
}

/** "Done · 2 kills", "Not done", or that Blizzard doesn't count it. */
export function dungeonStatusText(dungeon: CharacterDungeon): string {
  const status = dungeonStatus(dungeon);
  if (status === DUNGEON_STATUS.UNTRACKED) return DUNGEON_UNTRACKED_LABEL;
  if (status === DUNGEON_STATUS.NOT_DONE) return "Not done";
  return `Done · ${formatCount(dungeon.kills ?? 0, "kill", "kills")}`;
}

/** True when the character can't enter yet. */
export function belowRequiredLevel(dungeon: CharacterDungeon, level: number): boolean {
  return dungeon.required_level !== null && level < dungeon.required_level;
}

/** A dungeon not known done that the character can enter, at about its level. */
export function fitsNow(dungeon: CharacterDungeon, level: number): boolean {
  if (dungeonStatus(dungeon) === DUNGEON_STATUS.DONE || belowRequiredLevel(dungeon, level)) return false;
  return level >= dungeon.level_min - DUNGEON_FIT_LEVEL_SPREAD && level <= dungeon.level_max + DUNGEON_FIT_LEVEL_SPREAD;
}

/** The dungeon's guide page; null for Forever's own dungeons, which have none. */
export function dungeonGuideHref(dungeon: CharacterDungeon): string | null {
  if (!dungeon.classic) return null;
  return dungeonPageHref(dungeonSlug(dungeon.name));
}

/** "Final boss Edwin VanCleef · Level 16 · needs level 40". */
export function dungeonDetail(dungeon: CharacterDungeon, level: number): string {
  const parts = [dungeonLevelText(dungeon)];
  if (dungeon.boss !== null) parts.unshift(`Final boss ${dungeon.boss}`);
  if (belowRequiredLevel(dungeon, level)) parts.push(`needs level ${dungeon.required_level}`);
  return parts.join(" · ");
}
