import type { CharacterItem } from "@/games/wow-forever/types/character/characterItem";

/** What one paper-doll socket holds: the item, nothing, or the off hand a two-hander fills. */
export type SlotContent =
  | { kind: "item"; item: CharacterItem }
  | { kind: "empty" }
  | { kind: "two_hand" };
