import type { TamableBeast } from "@/games/wow-forever/types/hunterPets/tamableBeast";

/** Each ability-rank spell to the beasts that teach it, lowest level first. */
export function teachersBySpell(beasts: readonly TamableBeast[]): Map<number, TamableBeast[]> {
  const bySpell = new Map<number, TamableBeast[]>();
  for (const beast of beasts) {
    for (const teaching of beast.teaches) {
      const list = bySpell.get(teaching.spell) ?? [];
      list.push(beast);
      bySpell.set(teaching.spell, list);
    }
  }
  for (const list of bySpell.values()) {
    list.sort((a, b) => (a.minLevel ?? Infinity) - (b.minLevel ?? Infinity) || a.name.localeCompare(b.name));
  }
  return bySpell;
}
