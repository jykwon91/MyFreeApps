import type { ClientItem } from "@/games/wow-forever/types/clientItem";

/** Limits the item search to items that fit one slot (a BiS list row), in place of the slot/class filters. */
export interface ItemSearchSlotLimit {
  /** Shown under the box: "Items a Warlock can wear in Head". */
  label: string;
  fits: (item: ClientItem) => boolean;
}
