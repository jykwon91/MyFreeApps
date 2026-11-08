import type { RaresData } from "@/games/wow-forever/types/rares/raresData";

/** The rares data's load state (its own lazy chunks). */
export type RaresState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; data: RaresData }
  | { status: "error"; retry: () => void };
