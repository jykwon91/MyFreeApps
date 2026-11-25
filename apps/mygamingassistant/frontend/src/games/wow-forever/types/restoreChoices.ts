import type { RestoreOption } from "@/games/wow-forever/types/restoreOption";

/** One track's answer: the Mage's free one first, then the others cheapest first. */
export interface RestoreChoices {
  mage: RestoreOption | null;
  others: RestoreOption[];
}
