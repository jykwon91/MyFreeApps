import type { TrainerNpcSpells } from "@/games/wow-forever/types/trainers/trainerNpcSpells";

/** Load state of the trainer recipe data. */
export type TrainerNpcSpellsState =
  | { status: "loading" }
  | { status: "ready"; data: TrainerNpcSpells }
  | { status: "error"; retry: () => void };
