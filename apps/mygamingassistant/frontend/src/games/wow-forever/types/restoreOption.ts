/** How you get it: a Mage conjures it, a vendor sells it, a mob drops it, or you cook it. */
export type RestoreWay = "mage" | "vendor" | "drop" | "cooked";

/** One thing to eat or drink for health or mana, and how to get it. */
export interface RestoreOption {
  id: number;
  name: string;
  level: number;
  /** Health (food) or mana (drink) it gives back. */
  amount: number;
  seconds: number;
  way: RestoreWay;
  /** Copper to buy it from a vendor; null when it isn't bought that way. */
  vendorCopper: number | null;
  /** The Mage level that conjures it; null = not known. */
  mageLevel: number | null;
}
