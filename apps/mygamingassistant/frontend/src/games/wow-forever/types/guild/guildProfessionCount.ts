import type { GuideProfession } from "@/games/wow-forever/data/professions/professionPicker";

/** One profession someone in the guild has, for the roster's Profession filter. */
export interface GuildProfessionCount {
  id: GuideProfession;
  label: string;
  /** Members who have learned it. */
  count: number;
}
