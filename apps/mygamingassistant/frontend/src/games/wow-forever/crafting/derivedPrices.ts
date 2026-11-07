/**
 * Prices for materials nobody has sold yet, worked out from prices we do have.
 *
 * Two honest derivations only: an essence from the other half of its pair
 * (3 Lesser = 1 Greater, both ways, free in game), and an item another
 * profession makes from the sum of its reagents — only when every reagent has
 * a price. Anything else stays unpriced; it is never guessed.
 */
import { essencePartner, type EnteredPrices } from "@/games/wow-forever/crafting/matPrices";
import type { AutoPrice } from "@/games/wow-forever/types/autoPrice";
import type { DerivedPrice } from "@/games/wow-forever/types/derivedPrice";
import type { MakerRecipe } from "@/games/wow-forever/types/makerRecipe";

export type Makers = Readonly<Record<string, MakerRecipe>>;

/**
 * A derived price for each of `ids` that can have one. `known` is what is
 * already priced (auction prices and yours); an item's derived price is worked
 * out from the others, never from its own price, so it shows what the item is
 * worth even while you've typed over it. Cycles (an item made from itself,
 * the two halves of an essence pair) end as "no price", never loop.
 */
export function derivePrices(known: EnteredPrices, makers: Makers, ids: Iterable<number>): ReadonlyMap<number, DerivedPrice> {
  const visiting = new Set<number>();

  function priceOf(id: number): number | undefined {
    if (visiting.has(id)) return undefined;
    return known[String(id)] ?? derive(id)?.copper;
  }

  function fromEssence(id: number): DerivedPrice | null {
    const partner = essencePartner(id);
    if (!partner) return null;
    const other = priceOf(partner.id);
    if (other === undefined) return null;
    return { copper: Math.round(other * partner.perThis), from: "essence", partner: partner.id };
  }

  function fromMaterials(id: number): DerivedPrice | null {
    const maker = makers[String(id)];
    if (!maker || maker.count <= 0) return null;
    let total = 0;
    for (const reagent of maker.reagents) {
      const each = priceOf(reagent.id);
      if (each === undefined) return null;
      total += each * reagent.count;
    }
    return { copper: Math.round(total / maker.count), from: "materials" };
  }

  function derive(id: number): DerivedPrice | null {
    visiting.add(id);
    const result = fromEssence(id) ?? fromMaterials(id);
    visiting.delete(id);
    return result;
  }

  const out = new Map<number, DerivedPrice>();
  for (const id of ids) {
    const derived = derive(id);
    if (derived) out.set(id, derived);
  }
  return out;
}

/** The price nobody typed: the auction price always wins over a derived one. */
export function autoPrice(auction: number | undefined, derived: DerivedPrice | undefined): AutoPrice | undefined {
  if (auction !== undefined) return { copper: auction, from: "auction" };
  return derived;
}

/** `known` with the derived prices filled in where it has none, the shape the price book reads. */
export function withDerived(known: EnteredPrices, derived: ReadonlyMap<number, DerivedPrice>): EnteredPrices {
  const out: Record<string, number> = {};
  for (const [id, price] of derived) out[String(id)] = price.copper;
  return { ...out, ...known };
}
