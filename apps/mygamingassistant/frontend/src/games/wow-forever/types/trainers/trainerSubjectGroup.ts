import type { TrainerSubject } from "@/games/wow-forever/types/trainers/trainerSubject";

/** One heading in the trainers picker ("Classes", "Crafting", …). */
export interface TrainerSubjectGroup {
  label: string;
  subjects: readonly TrainerSubject[];
}
