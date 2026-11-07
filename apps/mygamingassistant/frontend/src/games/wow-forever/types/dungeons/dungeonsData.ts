import type { Dungeon } from "@/games/wow-forever/types/dungeons/dungeon";

/** Every dungeon page, lowest level first, and the client build its Forever facts come from. */
export interface DungeonsData {
  dungeons: readonly Dungeon[];
  clientBuild: string;
}
