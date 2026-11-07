import { isCraftingProfession } from "@/games/wow-forever/lib/guideProfession";
import type { CraftedBy } from "@/games/wow-forever/types/itemPages/craftedBy";
import { ITEM_BIND, type ItemBind } from "@/games/wow-forever/types/itemPages/itemBind";
import type { ItemPageFacts } from "@/games/wow-forever/types/itemPages/itemPageFacts";
import type { RawItemFacts } from "@/games/wow-forever/types/itemPages/rawItemFacts";

const BINDS: readonly number[] = Object.values(ITEM_BIND);

function isBind(value: unknown): value is ItemBind {
  return typeof value === "number" && BINDS.includes(value);
}

function crafted(row: readonly unknown[]): CraftedBy | null {
  const [profession, skill, spell, recipe, reagents, learn, learnItem] = row;
  const key = String(profession);
  if (!isCraftingProfession(key) || !Array.isArray(reagents)) return null;
  return {
    profession: key,
    skill: Number(skill),
    spell: Number(spell),
    recipe: String(recipe),
    reagents: reagents.map((r: readonly unknown[]) => ({ id: Number(r[0]), count: Number(r[1]), name: String(r[2]) })),
    learn: String(learn ?? ""),
    learnItem: String(learnItem ?? ""),
  };
}

/** A Forever shard's facts for one item; missing = nothing known. */
export function decodeItemFacts(raw: RawItemFacts | undefined): ItemPageFacts {
  return {
    bind: isBind(raw?.bind) ? raw.bind : null,
    buyPrice: raw?.buy && raw.buy > 0 ? raw.buy : null,
    crafted: (raw?.crafted ?? []).map(crafted).filter((c): c is CraftedBy => c !== null),
  };
}
