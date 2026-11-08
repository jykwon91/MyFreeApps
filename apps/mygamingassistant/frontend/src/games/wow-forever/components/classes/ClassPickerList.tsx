import { WOW_CLASSES } from "@/games/wow-forever/data/classes";
import { CLASSES_PATH } from "@/games/wow-forever/data/classes/classesConfig";

/** Narrow sub-nav listing all classes — shown when the URL has an unknown class slug. */
export default function ClassPickerList() {
  return (
    <ul className="flex flex-wrap gap-2">
      {WOW_CLASSES.map((c) => (
        <li key={c.id}>
          <a
            href={`${CLASSES_PATH}/${c.id}`}
            className="inline-flex items-center rounded-md border px-3 py-1.5 text-sm min-h-[44px] bg-card hover:bg-muted/40 transition-colors"
          >
            {c.name}
          </a>
        </li>
      ))}
    </ul>
  );
}
