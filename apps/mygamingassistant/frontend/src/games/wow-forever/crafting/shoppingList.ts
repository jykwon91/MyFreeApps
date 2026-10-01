import { expectedCrafts } from "@/games/wow-forever/crafting/craftRoute";
import type { CraftingFile, CraftReagent, CraftRecipe, ResolvedRouteEntry, ShoppingLine } from "@/games/wow-forever/types/crafting";

export interface ShoppingList {
  /** Everything to buy, farm or get made, in the order the route first uses it. */
  buy: ShoppingLine[];
  /** What you craft yourself on the way beyond what the route makes (extra bolts). Its materials are in `buy`. */
  make: ShoppingLine[];
}

interface Tally {
  names: Map<number, string>;
  counts: Map<number, number>;
}

function add(tally: Tally, reagent: CraftReagent, times: number): void {
  if (!tally.names.has(reagent.id)) tally.names.set(reagent.id, reagent.name);
  tally.counts.set(reagent.id, (tally.counts.get(reagent.id) ?? 0) + reagent.count * times);
}

/** The recipe a profession makes an item with — the lowest-skill one. */
function makerOf(itemId: number, recipes: readonly CraftRecipe[]): CraftRecipe | undefined {
  return recipes
    .filter((r) => r.creates?.id === itemId)
    .sort((a, b) => a.yellow - b.yellow)[0];
}

/**
 * Materials for the route from `fromSkill` on (the whole route when null).
 *
 * Items this profession makes itself (bolts of cloth, Mote of Magic) are not
 * bought: the route's own crafts of them count first, and any still short
 * are made from their raw materials, which go on the buy list.
 */
export function shoppingList(
  entries: readonly ResolvedRouteEntry[],
  fromSkill: number | null,
  data: Pick<CraftingFile, "madeBy" | "recipes">,
  professionName: string,
): ShoppingList {
  const start = fromSkill ?? 1;
  const need: Tally = { names: new Map(), counts: new Map() };
  const produced = new Map<number, number>();

  for (const entry of entries) {
    if (entry.kind !== "craft" || entry.step.to <= start) continue;
    const crafts = expectedCrafts(entry.recipe, Math.max(entry.step.from, start), entry.step.to);
    for (const reagent of entry.recipe.reagents) add(need, reagent, crafts);
    const made = entry.recipe.creates;
    if (made) produced.set(made.id, (produced.get(made.id) ?? 0) + made.count * crafts);
  }

  const ownMade = (id: number) => data.madeBy[String(id)] === professionName;
  const make: ShoppingLine[] = [];
  // Expanding one self-made item can need another (Mooncloth needs Felcloth), so repeat until nothing is short.
  const expanded = new Set<number>();
  for (let changed = true; changed; ) {
    changed = false;
    for (const [id, count] of need.counts) {
      if (!ownMade(id) || expanded.has(id)) continue;
      expanded.add(id);
      changed = true;
      const short = count - (produced.get(id) ?? 0);
      const maker = makerOf(id, data.recipes);
      if (short <= 0 || !maker?.creates) continue;
      const batches = Math.ceil(short / maker.creates.count);
      for (const reagent of maker.reagents) add(need, reagent, batches);
      make.push({
        id,
        name: need.names.get(id) ?? maker.creates.name,
        count: short,
        makesFrom: maker.reagents.map((r) => ({ ...r, count: r.count * batches })),
      });
      break;
    }
  }

  const buy: ShoppingLine[] = [];
  for (const [id, count] of need.counts) {
    if (ownMade(id)) continue;
    const madeBy = data.madeBy[String(id)];
    buy.push({ id, name: need.names.get(id) ?? `Item ${id}`, count, ...(madeBy ? { madeBy } : {}) });
  }
  return { buy, make };
}

/** The list as plain text, for pasting into notes or chat. */
export function shoppingListText(list: ShoppingList): string {
  const lines = list.buy.map((l) => `${l.count}x ${l.name}${l.madeBy ? ` (${l.madeBy})` : ""}`);
  for (const l of list.make) {
    const from = (l.makesFrom ?? []).map((r) => `${r.count}x ${r.name}`).join(", ");
    lines.push(`Make ${l.count}x ${l.name} (from ${from})`);
  }
  return lines.join("\n");
}
