import { WOW_CLASSES } from "@/games/wow-forever/data/classes";
import { PROFESSION_GROUPS } from "@/games/wow-forever/data/professions/professionPicker";
import type { TrainerSubject } from "@/games/wow-forever/types/trainers/trainerSubject";
import type { TrainerSubjectGroup } from "@/games/wow-forever/types/trainers/trainerSubjectGroup";

/** The picker: the nine classes, then the professions in the Professions page's groups. */
export const TRAINER_SUBJECT_GROUPS: readonly TrainerSubjectGroup[] = [
  { label: "Classes", subjects: WOW_CLASSES.map((c) => ({ kind: "class", id: c.id, label: c.name })) },
  ...PROFESSION_GROUPS.map((g) => ({
    label: g.label,
    subjects: g.options.map((o): TrainerSubject => ({ kind: "profession", id: o.id, label: o.label })),
  })),
];

/** The class or profession a page slug names; undefined for anything else. */
export function findTrainerSubject(slug: string): TrainerSubject | undefined {
  return TRAINER_SUBJECT_GROUPS.flatMap((g) => g.subjects).find((s) => s.id === slug);
}
