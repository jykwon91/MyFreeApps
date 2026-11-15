import type { TrainerRecipeTuple } from "@/games/wow-forever/types/trainers/trainerRecipeTuple";

/** NPC entry id (string) → sorted recipe tuples. */
export type TrainerProfessionMap = Record<string, readonly TrainerRecipeTuple[]>;
