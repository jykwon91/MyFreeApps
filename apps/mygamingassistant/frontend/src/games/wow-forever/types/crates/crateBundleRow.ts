import type { CrateBundle } from "@/games/wow-forever/types/crates/crateBundle";

/** One bundle of a crate with its auction price (copper; null = the material has no price). */
export interface CrateBundleRow {
  bundle: CrateBundle;
  /** One unit of the material. */
  unitPrice: number | null;
  /** count x unit price. */
  cost: number | null;
  /** The cheapest priced bundle of its crate. */
  cheapest: boolean;
}
