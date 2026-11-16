import { LOAD_STATUS } from "@/games/wow-forever/data/loadStatus";
import type { DungeonsData } from "@/games/wow-forever/types/dungeons/dungeonsData";

/** The dungeon pages' data while it loads. */
export type DungeonsState =
  | { status: typeof LOAD_STATUS.loading }
  | { status: typeof LOAD_STATUS.error; retry: () => void; retrying: boolean }
  | { status: typeof LOAD_STATUS.ready; data: DungeonsData };
