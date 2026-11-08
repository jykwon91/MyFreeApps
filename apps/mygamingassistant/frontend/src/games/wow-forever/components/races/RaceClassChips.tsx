import { findClass, type WowClassId } from "@/games/wow-forever/data/classes";
import { RACES_TEXT } from "@/games/wow-forever/data/races/racesConfig";

interface RaceClassChipsProps {
  classes: readonly WowClassId[];
  newClasses: readonly WowClassId[];
}

/** The classes a race can be; a combination Classic didn't allow says "New in Forever". */
export default function RaceClassChips({ classes, newClasses }: RaceClassChipsProps) {
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Classes" data-testid="race-classes">
      {classes.map((id) => (
        <li key={id} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs">
          {findClass(id)?.name ?? id}
          {newClasses.includes(id) ? (
            <span className="font-medium" data-testid="race-class-new">
              · {RACES_TEXT.newClass}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
