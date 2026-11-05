import type { StatValues } from "@/games/wow-forever/data/statKeys";
import type { WeaponStats } from "@/games/wow-forever/types/compareItem";

/** The numbers of an item that scoring reads — what "edited by you" is measured on. */
export interface ItemNumbers {
  armor: number | null;
  weapon: WeaponStats | null;
  stats: StatValues;
}
