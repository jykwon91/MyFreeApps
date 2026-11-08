import type { WowClassId } from "@/games/wow-forever/data/classes";

/** A checked `find_macros` input. */
export interface AskMacrosInput {
  classId: WowClassId | null;
  /** What the macro should do; null = any. */
  query: string | null;
  limit: number;
}
