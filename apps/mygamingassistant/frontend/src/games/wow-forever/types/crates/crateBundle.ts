import type { CrateMaterial } from "@/games/wow-forever/types/crates/crateMaterial";

/** One way to fill a crate: this many of one material. A crate takes any ONE of its bundles. */
export interface CrateBundle {
  count: number;
  item: CrateMaterial;
}
