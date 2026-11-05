import type { ResolvedRouteEntry } from "@/games/wow-forever/types/crafting";
import type { CraftingSpecChoice, CraftingSpecs } from "@/games/wow-forever/types/craftingSpecs";

/** A `?spec=` / saved value: one of the profession's choices, else null (not chosen yet). */
export function parseSpec(specs: CraftingSpecs | undefined, raw: unknown): string | null {
  return specs?.choices.find((c) => c.id === raw)?.id ?? null;
}

/** The choice and every one it needs first (Master Axesmith -> Weaponsmith). */
export function specChain(specs: CraftingSpecs, id: string): CraftingSpecChoice[] {
  const out: CraftingSpecChoice[] = [];
  for (let choice = specs.choices.find((c) => c.id === id); choice; choice = specs.choices.find((c) => c.id === choice?.requires)) {
    out.push(choice);
  }
  return out;
}

/**
 * The route for a chosen specialization: options that need another
 * specialization are dropped. Not chosen yet (null) keeps every option — each
 * spec-only one carries its chip.
 */
export function routeForSpec(entries: readonly ResolvedRouteEntry[], specs: CraftingSpecs | undefined, id: string | null): ResolvedRouteEntry[] {
  if (!specs || id === null) return [...entries];
  const allowed = new Set(specChain(specs, id).map((c) => c.spell));
  return entries.map((entry) => {
    if (entry.kind !== "options") return entry;
    const keep = entry.recipes.map((r) => r.spec === undefined || allowed.has(r.spec));
    return {
      kind: "options",
      step: { ...entry.step, options: entry.step.options.filter((_, i) => keep[i]) },
      recipes: entry.recipes.filter((_, i) => keep[i]),
    };
  });
}
