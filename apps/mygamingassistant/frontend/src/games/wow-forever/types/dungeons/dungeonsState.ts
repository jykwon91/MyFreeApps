import type { DungeonsData } from "@/games/wow-forever/types/dungeons/dungeonsData";

/** The dungeon pages' data while it loads. */
export type DungeonsState =
  | { status: "loading" }
  | { status: "error"; retry: () => void; retrying: boolean }
  | { status: "ready"; data: DungeonsData };
