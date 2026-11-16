import type { MyProfession } from "@/games/wow-forever/types/trainers/myProfession";

/** What rows are marked with: your profession, and whether only "Known" can be said (other faction). */
export interface RecipeMarks {
  mine: MyProfession;
  knownOnly: boolean;
}
