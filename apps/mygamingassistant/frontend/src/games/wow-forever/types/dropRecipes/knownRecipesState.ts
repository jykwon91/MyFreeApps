import type { MyProfession } from "@/games/wow-forever/types/trainers/myProfession";

/** The character picked on the Drop-only recipes page, read for the profession on screen. */
export type KnownRecipesState =
  | { kind: "none" }
  | { kind: "loading"; characterName: string }
  | { kind: "error"; retry: () => void; retrying: boolean }
  | { kind: "not-found"; characterName: string }
  | { kind: "not-learned"; characterName: string }
  | { kind: "ready"; mine: MyProfession };
