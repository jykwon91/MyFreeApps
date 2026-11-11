import type { TrainerServices } from "@/games/wow-forever/types/trainers/trainerServices";

/** The trainer NPC data: loading, ready, or failed with a retry. */
export type TrainerServicesState =
  | { status: "loading" }
  | { status: "ready"; data: TrainerServices }
  | { status: "error"; retry: () => void; retrying: boolean };
