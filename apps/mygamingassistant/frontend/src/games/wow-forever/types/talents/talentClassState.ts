import type { TalentClassData } from "@/games/wow-forever/types/talents/talentClassData";

/** A class's talent data while it loads. */
export type TalentClassState =
  | { status: "loading" }
  | { status: "error"; retry: () => void; retrying: boolean }
  | { status: "ready"; data: TalentClassData };
