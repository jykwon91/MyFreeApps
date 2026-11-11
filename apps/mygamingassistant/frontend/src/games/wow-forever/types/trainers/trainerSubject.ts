import type { WowClassId } from "@/games/wow-forever/data/classes";
import type { GuideProfession } from "@/games/wow-forever/data/professions/professionPicker";

/** What a trainers page is about: a class, or a profession. Its id is the page's slug. */
export type TrainerSubject =
  | { kind: "class"; id: WowClassId; label: string }
  | { kind: "profession"; id: GuideProfession; label: string };
