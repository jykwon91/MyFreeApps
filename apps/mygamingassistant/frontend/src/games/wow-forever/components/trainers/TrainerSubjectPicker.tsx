import clsx from "clsx";
import { Link } from "react-router-dom";
import { TRAINER_SUBJECT_GROUPS } from "@/games/wow-forever/data/trainers/trainerSubjects";
import { TRAINERS_PATH } from "@/games/wow-forever/data/trainers/trainersConfig";

/** Every class and profession as links under their group's heading (a new pick is a new page, so Back works). */
export default function TrainerSubjectPicker({ current }: { current: string | null }) {
  return (
    <nav aria-label="Class or profession" className="space-y-3" data-testid="trainers-picker">
      {TRAINER_SUBJECT_GROUPS.map((group) => (
        <div key={group.label} className="space-y-1">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{group.label}</h2>
          <div className="flex flex-wrap gap-2">
            {group.subjects.map((s) => (
              <Link
                key={s.id}
                to={`${TRAINERS_PATH}/${s.id}`}
                aria-current={s.id === current ? "page" : undefined}
                className={clsx(
                  "inline-flex items-center rounded-md border px-3 text-sm min-h-[44px] transition-colors",
                  s.id === current && "bg-primary text-primary-foreground",
                  s.id !== current && "bg-card hover:bg-muted/40",
                )}
              >
                {s.label}
              </Link>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}
