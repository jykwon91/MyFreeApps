import {
  ENCHANT_PRIMARY_STATS as PRIMARY_STATS,
  ENCHANT_SCHOOL_DAMAGE as SCHOOL_DAMAGE,
  ENCHANT_SCHOOL_PATTERN as SCHOOL,
  ENCHANT_SCHOOL_RESISTANCE as SCHOOL_RESISTANCE,
  ENCHANT_UNSCORED as UNSCORED,
} from "@/games/wow-forever/data/guild/enchantEffectConfig";
import type { StatValues } from "@/games/wow-forever/data/statKeys";
import type { EnchantEffect } from "@/games/wow-forever/types/guild/enchantEffect";

const stats = (values: StatValues): EnchantEffect => ({ stats: values, armor: 0, weaponDamage: 0 });

/** One stat per match; each rule is tried in order, so the first that fits the wording wins. */
const RULES: readonly ((text: string) => EnchantEffect | null)[] = [
  (t) => {
    const m = /(\d+)% chance to (dodge|block)/i.exec(t);
    if (!m) return null;
    return stats(m[2].toLowerCase() === "dodge" ? { dodge_pct: Number(m[1]) } : { block_pct: Number(m[1]) });
  },
  (t) => (UNSCORED.test(t) ? stats({}) : null),
  // "healing by up to 16 and damage by up to 6", "up to 55 points of healing … and up to 19 points of damage"
  (t) => {
    const ups = [...t.matchAll(/up to (\d+)/gi)].map((m) => Number(m[1]));
    return ups.length === 2 && /heal/i.test(t) ? stats({ healing: ups[0], spell_damage: ups[1] }) : null;
  },
  (t) => {
    const m = /damage and healing by up to (\d+)/i.exec(t);
    return m ? stats({ spell_power: Number(m[1]) }) : null;
  },
  (t) => {
    const m = new RegExp(`${SCHOOL} damage by up to (\\d+)|up to (\\d+) additional ${SCHOOL} damage`, "i").exec(t);
    if (!m) return null;
    const school = (m[1] ?? m[4]).toLowerCase();
    return stats({ [SCHOOL_DAMAGE[school]]: Number(m[2] ?? m[3]) });
  },
  (t) => {
    const m = /up to (\d+) damage to spells/i.exec(t);
    return m ? stats({ spell_damage: Number(m[1]) }) : null;
  },
  (t) => {
    const m = /(\d+) mana every 5/i.exec(t);
    return m ? stats({ mp5: Number(m[1]) }) : null;
  },
  (t) => {
    const m = /(\d+) to all resistances|all schools of magic by (\d+)/i.exec(t);
    return m ? stats({ all_resistance: Number(m[1] ?? m[2]) }) : null;
  },
  (t) => {
    const m = new RegExp(`(\\d+) ${SCHOOL} resistance|resistance to ${SCHOOL} by (\\d+)`, "i").exec(t);
    if (!m) return null;
    const key = SCHOOL_RESISTANCE[(m[2] ?? m[3]).toLowerCase()];
    return key ? stats({ [key]: Number(m[1] ?? m[4]) }) : null;
  },
  (t) => {
    const m = /(\d+) to all stats|all stats by (\d+)/i.exec(t);
    if (!m) return null;
    const n = Number(m[1] ?? m[2]);
    return stats(Object.fromEntries(PRIMARY_STATS.map((s) => [s, n])));
  },
  (t) => {
    const m = /defense[^.\d]*?(\d+)|(\d+) defense/i.exec(t);
    return m ? stats({ defense: Number(m[1] ?? m[2]) }) : null;
  },
  (t) => {
    const stat = PRIMARY_STATS.find((s) => new RegExp(`\\b${s}\\b`, "i").test(t));
    const n = /(\d+)/.exec(t);
    return stat && n ? stats({ [stat]: Number(n[1]) }) : null;
  },
  (t) => {
    const m = /(\d+) additional armor|armor by (\d+)/i.exec(t);
    return m ? { stats: {}, armor: Number(m[1] ?? m[2]), weaponDamage: 0 } : null;
  },
  (t) => {
    const m = /(\d+) additional points? of damage|do \+?(\d+) damage/i.exec(t);
    return m ? { stats: {}, armor: 0, weaponDamage: Number(m[1] ?? m[2]) } : null;
  },
];

/**
 * Reads an enchant's tooltip ("Permanently enchant gloves to grant +7 Strength.") into what it adds, so
 * Help each other can tell whether it suits the wearer's class. Null when it adds nothing a stat weight
 * scores (Fishing, Minor Speed, Crusader-style procs).
 */
export function enchantEffect(text: string | null): EnchantEffect | null {
  if (!text) return null;
  for (const rule of RULES) {
    const effect = rule(text);
    if (!effect) continue;
    const empty = Object.keys(effect.stats).length === 0 && effect.armor === 0 && effect.weaponDamage === 0;
    return empty ? null : effect;
  }
  return null;
}
