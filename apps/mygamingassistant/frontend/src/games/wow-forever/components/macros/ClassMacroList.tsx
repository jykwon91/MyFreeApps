import MacroClassPicker from "@/games/wow-forever/components/macros/MacroClassPicker";
import MacroClassSection from "@/games/wow-forever/components/macros/MacroClassSection";
import { useMacroClassFilter } from "@/games/wow-forever/hooks/useMacroClassFilter";
import { macroClassGroups } from "@/games/wow-forever/lib/macros/macroCatalog";

/** "Ready-made macros by class": every class's macros, or the one class picked. */
export default function ClassMacroList() {
  const [filter, setFilter] = useMacroClassFilter();
  return (
    <section aria-labelledby="class-macros-heading" className="space-y-4">
      <div className="space-y-1">
        <h2 id="class-macros-heading" className="text-lg font-semibold">
          Ready-made macros by class
        </h2>
        <p className="text-sm text-muted-foreground">Copy, paste, done. Each class&rsquo;s hover-cast macros come first.</p>
      </div>
      <MacroClassPicker value={filter} onChange={setFilter} />
      {macroClassGroups(filter).map((group) => (
        <MacroClassSection key={group.wowClass.id} group={group} />
      ))}
    </section>
  );
}
