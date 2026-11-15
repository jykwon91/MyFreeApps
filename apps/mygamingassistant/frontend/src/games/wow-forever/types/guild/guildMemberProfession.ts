import type { GuideProfession } from "@/games/wow-forever/data/professions/professionPicker";

/** One profession on a roster row: which, the skill ("148 / 225") and the rank it's trained to ("Expert"). */
export interface GuildMemberProfession {
  profession: GuideProfession;
  label: string;
  skill: string;
  /** Null when the cap isn't a known rank's. */
  rank: string | null;
}
