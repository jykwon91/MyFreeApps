import type { WowClassId } from "@/games/wow-forever/data/classes";

/** One version of a racial's tooltip: the classes it's for (null = every class the race can be) and its text. */
export interface RacialVariant {
  classes: readonly WowClassId[] | null;
  text: string;
}
