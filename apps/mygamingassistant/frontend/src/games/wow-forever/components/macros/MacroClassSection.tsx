import MacroCard from "@/games/wow-forever/components/macros/MacroCard";
import { classAccent } from "@/games/wow-forever/data/classAccents";
import { MACRO_KIND_LABELS } from "@/games/wow-forever/data/macros/macroKinds";
import { MACRO_NAMES } from "@/games/wow-forever/data/macros/macroNames";
import { missingNames } from "@/games/wow-forever/lib/macros/macroNameCheck";
import type { MacroClassGroup } from "@/games/wow-forever/types/macros/macroClassGroup";

interface MacroClassSectionProps {
  group: MacroClassGroup;
}

/** One class's macros, grouped by kind with hover cast first. */
export default function MacroClassSection({ group: { wowClass, kinds } }: MacroClassSectionProps) {
  return (
    <section
      aria-labelledby={`macros-${wowClass.id}`}
      className="space-y-4 border-l-[3px] pl-3"
      style={{ borderLeftColor: classAccent(wowClass.id) }}
    >
      <h3 id={`macros-${wowClass.id}`} className="text-lg font-semibold">
        {wowClass.name}
      </h3>
      {kinds.map(({ kind, macros }) => (
        <section key={kind} aria-labelledby={`macros-${wowClass.id}-${kind}`} className="space-y-3">
          <h4 id={`macros-${wowClass.id}-${kind}`} className="text-base font-semibold">
            {MACRO_KIND_LABELS[kind]}
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {macros.map((macro) => (
              <MacroCard
                key={macro.id}
                headingLevel="h5"
                title={macro.title}
                summary={macro.summary}
                text={macro.text}
                names={[...macro.spells, ...macro.items]}
                missing={missingNames(macro, MACRO_NAMES)}
                unconfirmed={macro.unconfirmed}
              />
            ))}
          </div>
        </section>
      ))}
    </section>
  );
}
