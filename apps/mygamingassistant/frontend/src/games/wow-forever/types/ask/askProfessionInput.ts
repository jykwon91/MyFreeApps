import type { GuideProfession } from "@/games/wow-forever/data/professions/professionPicker";

/** A checked `profession_guide` input. */
export interface AskProfessionInput {
  profession: GuideProfession;
  /** The skill the player said; null = from the start. */
  skill: number | null;
}
