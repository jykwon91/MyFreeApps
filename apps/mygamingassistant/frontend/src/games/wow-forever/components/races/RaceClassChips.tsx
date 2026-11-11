import { Link } from "react-router-dom";
import GameIcon from "@/games/wow-forever/components/shared/GameIcon";
import { findClass, type WowClassId } from "@/games/wow-forever/data/classes";
import { CLASSES_PATH } from "@/games/wow-forever/data/classes/classesConfig";
import { RACES_TEXT } from "@/games/wow-forever/data/races/racesConfig";
import { classIcon } from "@/games/wow-forever/lib/icons/wowIcons";

interface RaceClassChipsProps {
  classes: readonly WowClassId[];
  newClasses: readonly WowClassId[];
}

/** The classes a race can be; each links to its class page; a new-in-Forever combo says so. */
export default function RaceClassChips({ classes, newClasses }: RaceClassChipsProps) {
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Classes" data-testid="race-classes">
      {classes.map((id) => (
        <li key={id} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs">
          <Link to={`${CLASSES_PATH}/${id}`} className="inline-flex items-center gap-1 hover:underline underline-offset-2">
            <GameIcon icon={classIcon(id)} size={16} alt="" />
            {findClass(id)?.name ?? id}
          </Link>
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
