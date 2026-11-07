import { Link } from "react-router-dom";
import MacroTextCard from "@/games/wow-forever/components/guide/MacroTextCard";
import { classAccent } from "@/games/wow-forever/data/classAccents";
import { MORE_CLASS_MACROS } from "@/games/wow-forever/data/guide/classMacros";
import { classMacroGroups, classMacroText } from "@/games/wow-forever/lib/classMacros";

/** "Ready-made macros": the templates filled in with each class's spells. */
export default function ClassMacroList() {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-base font-semibold">Ready-made macros by class</h3>
        <p className="text-sm text-muted-foreground">
          Copy, paste, done. Rogues and Warriors aren&rsquo;t listed: they fight in melee on their own target, so mouseover
          rarely helps.
        </p>
      </div>
      {classMacroGroups().map(({ wowClass, macros }) => {
        const more = MORE_CLASS_MACROS[wowClass.id];
        return (
          <section
            key={wowClass.id}
            aria-labelledby={`macros-${wowClass.id}`}
            className="space-y-3 border-l-[3px] pl-3"
            style={{ borderLeftColor: classAccent(wowClass.id) }}
          >
            <h4 id={`macros-${wowClass.id}`} className="text-base font-semibold">
              {wowClass.name}
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {macros.map((macro) => (
                <MacroTextCard
                  key={macro.id}
                  headingLevel="h5"
                  title={`${macro.spell} (${wowClass.name})`}
                  summary={macro.summary}
                  text={classMacroText(macro)}
                />
              ))}
            </div>
            {more ? (
              <Link to={more.to} className="inline-flex items-center min-h-[44px] text-sm font-medium underline">
                {more.label}
              </Link>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
