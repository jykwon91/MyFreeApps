import type { BisSlotId } from "@/games/wow-forever/data/bisLists/bisSlots";
import type { BisList } from "@/games/wow-forever/types/bisLists/bisList";
import type { BisListsState } from "@/games/wow-forever/types/bisLists/bisListsState";

/** Changes to the saved lists. Ids and times come in the action, so the reducer stays pure. */
export type BisListAction =
  /** The lists another tab saved. */
  | { type: "load"; state: BisListsState }
  | { type: "create"; list: BisList }
  | { type: "select"; id: string }
  | { type: "rename"; id: string; name: string; now: number }
  | { type: "duplicate"; id: string; newId: string; now: number }
  | { type: "delete"; id: string }
  | { type: "setItem"; id: string; slot: BisSlotId; itemId: number | null; now: number }
  | { type: "toggleObtained"; id: string; slot: BisSlotId; now: number };
