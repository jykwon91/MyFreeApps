import { classIcon, professionIcon } from "@/games/wow-forever/lib/icons/wowIcons";
import type { TrainerSubject } from "@/games/wow-forever/types/trainers/trainerSubject";
import type { WowIcon } from "@/games/wow-forever/types/icons/wowIcon";

/** A trainers-page subject's in-game icon: the class's, or the profession's. */
export function trainerSubjectIcon(subject: TrainerSubject): WowIcon | null {
  if (subject.kind === "class") return classIcon(subject.id);
  return professionIcon(subject.id);
}
