import type { SpellbookClass } from "@/games/wow-forever/types/spellbook/spellbookClass";
import type { SpellbookClassicFile } from "@/games/wow-forever/types/spellbook/spellbookClassicFile";
import type { SpellbookFile } from "@/games/wow-forever/types/spellbook/spellbookFile";
import type { SpellbookFileRank } from "@/games/wow-forever/types/spellbook/spellbookFileRank";
import type { SpellbookFileSpell } from "@/games/wow-forever/types/spellbook/spellbookFileSpell";
import type { SpellbookLearnedBy } from "@/games/wow-forever/types/spellbook/spellbookLearnedBy";
import type { SpellbookRank } from "@/games/wow-forever/types/spellbook/spellbookRank";
import type { SpellbookSpell } from "@/games/wow-forever/types/spellbook/spellbookSpell";
import { normalizeText } from "@/games/wow-forever/worldMap/searchText";

interface ClassicLookup {
  costs: ReadonlyMap<number, number>;
  quests: ReadonlySet<number>;
  books: ReadonlySet<number>;
  texts: ReadonlyMap<number, string>;
  levels: ReadonlyMap<number, number>;
}

function byId<T>(record: Record<string, T>): Map<number, T> {
  return new Map(Object.entries(record).map(([id, value]) => [Number(id), value]));
}

function classicLookup(file: SpellbookClassicFile): ClassicLookup {
  return {
    costs: byId(file.costs),
    quests: new Set(file.quests),
    books: new Set(file.books),
    texts: byId(file.texts),
    levels: byId(file.levels),
  };
}

function learnedBy(rank: SpellbookFileRank, classic: ClassicLookup): SpellbookLearnedBy {
  if (rank.talent) return "talent";
  if (classic.costs.has(rank.spell)) return "trainer";
  if (classic.quests.has(rank.spell)) return "quest";
  if (classic.books.has(rank.spell)) return "book";
  return null;
}

function decodeRank(rank: SpellbookFileRank, classic: ClassicLookup): SpellbookRank {
  const classicLevel = rank.level === undefined ? classic.levels.get(rank.spell) : undefined;
  const classicText = rank.text === undefined ? classic.texts.get(rank.spell) : undefined;
  const by = learnedBy(rank, classic);
  return {
    spell: rank.spell,
    label: rank.rank ?? "",
    level: rank.level ?? classicLevel ?? null,
    levelClassic: classicLevel !== undefined,
    text: rank.text ?? classicText ?? null,
    textClassic: classicText !== undefined,
    learnedBy: by,
    cost: by === "trainer" ? (classic.costs.get(rank.spell) ?? null) : null,
    passive: rank.passive === true,
    changed: rank.changed === true,
  };
}

function decodeSpell(spell: SpellbookFileSpell, classic: ClassicLookup): SpellbookSpell {
  const ranks = spell.ranks.map((r) => decodeRank(r, classic));
  const levels = ranks.map((r) => r.level).filter((l): l is number => l !== null);
  return {
    id: spell.id,
    name: spell.name,
    tab: spell.tab,
    icon: spell.icon,
    races: spell.races ?? [],
    talent: spell.talent ?? null,
    downrank: spell.downrank ?? null,
    change: spell.changed ?? null,
    firstLevel: levels.length ? Math.min(...levels) : null,
    ranks,
    searchText: normalizeText([spell.name, ...ranks.flatMap((r) => [r.label, r.text ?? ""])].join(" ")),
  };
}

/** One class's spellbook: the Forever file with Classic's costs, quests, books and fallbacks merged in by spell id. */
export function decodeSpellbook(file: SpellbookFile, classicFile: SpellbookClassicFile): SpellbookClass {
  const classic = classicLookup(classicFile);
  return {
    classId: file.classId,
    clientBuild: file.clientBuild,
    tabs: file.tabs,
    spells: file.spells.map((s) => decodeSpell(s, classic)),
  };
}
