import type { AddonMat } from "@/games/wow-forever/types/professionsAddon/addonMat";

/** One recipe an "options" route row offers in place of a single pick. */
export interface AddonOption {
  name: string;
  detail: string;
  yellow: number;
  grey: number;
  mats: readonly AddonMat[];
}
