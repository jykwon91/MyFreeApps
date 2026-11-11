import { SPELLBOOK_RACE_NAMES } from "@/games/wow-forever/data/spellbook/spellbookRaces";
import type { SpellbookDemon } from "@/games/wow-forever/types/spellbook/spellbookDemon";
import type { SpellbookClass } from "@/games/wow-forever/types/spellbook/spellbookClass";
import type { LevelUnlock } from "@/games/wow-forever/types/trainers/levelUnlock";
import type { LevelUnlocks } from "@/games/wow-forever/types/trainers/levelUnlocks";

/**
 * A class's spellbook as "what you can learn at each level": only levels where
 * something unlocks, lowest first. Talent-granted ranks are left out (you get those
 * from talent points, not a trainer), and so are ranks with no known level.
 */
export function levelUnlocks(book: SpellbookClass): readonly LevelUnlocks[] {
  const byLevel = new Map<number, LevelUnlock[]>();
  for (const spell of book.spells) {
    const races = spell.races.map((r) => SPELLBOOK_RACE_NAMES[r] ?? `Race ${r}`);
    for (const rank of spell.ranks) {
      if (rank.level === null || rank.learnedBy === "talent") continue;
      const list = byLevel.get(rank.level) ?? [];
      list.push({
        spell: rank.spell,
        name: spell.name,
        icon: spell.icon,
        rank: rank.label,
        learnedBy: rank.learnedBy,
        races,
        levelClassic: rank.levelClassic,
        demon: null,
        knownOnSummon: false,
        grimoire: false,
      });
      byLevel.set(rank.level, list);
    }
  }
  return byLevelLadder(byLevel);
}

/** The Warlock's demons as the same ladder: each ability rank at the level its Grimoire asks for. */
export function demonUnlocks(demons: readonly SpellbookDemon[]): readonly LevelUnlocks[] {
  const byLevel = new Map<number, LevelUnlock[]>();
  for (const demon of demons) {
    for (const ability of demon.abilities) {
      for (const rank of ability.ranks) {
        const list = byLevel.get(rank.level) ?? [];
        list.push({
          spell: rank.spell,
          name: ability.name,
          icon: ability.icon,
          rank: rank.rank ?? "",
          learnedBy: null,
          races: [],
          levelClassic: false,
          demon: demon.name,
          knownOnSummon: rank.known === true,
          grimoire: rank.grimoire !== undefined,
        });
        byLevel.set(rank.level, list);
      }
    }
  }
  return byLevelLadder(byLevel);
}

function byLevelLadder(byLevel: ReadonlyMap<number, LevelUnlock[]>): readonly LevelUnlocks[] {
  return [...byLevel.entries()]
    .sort(([a], [b]) => a - b)
    .map(([level, unlocks]) => ({ level, unlocks: unlocks.sort((x, y) => x.name.localeCompare(y.name)) }));
}

/** Split the ladder at your level: what you've already passed, and what's still to come (your level included). */
export function splitAtLevel(
  ladder: readonly LevelUnlocks[],
  level: number | null,
): { passed: readonly LevelUnlocks[]; ahead: readonly LevelUnlocks[] } {
  if (level === null) return { passed: [], ahead: ladder };
  return { passed: ladder.filter((l) => l.level < level), ahead: ladder.filter((l) => l.level >= level) };
}
