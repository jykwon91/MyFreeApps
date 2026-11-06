import GearItemRow from "@/games/wow-forever/components/gear/GearItemRow";
import GearNextUpgrade from "@/games/wow-forever/components/gear/GearNextUpgrade";
import GearUnknownEpics from "@/games/wow-forever/components/gear/GearUnknownEpics";
import type { GearSlotResult } from "@/games/wow-forever/types/gearSlotResult";

/** One equipment slot: its top items, the next upgrade (leveling) and unknown-source epics (level 60). */
export default function GearSlotCard({ result }: { result: GearSlotResult }) {
  const { group, top, nextUpgrade, unknownEpics } = result;
  const headingId = `gear-slot-${group.id}`;
  return (
    <section aria-labelledby={headingId} data-testid="gear-slot-card" className="rounded-xl border bg-card p-4 space-y-3 min-w-0">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={headingId} className="font-semibold">
          {group.label}
        </h2>
        {group.note ? <span className="text-xs text-muted-foreground">{group.note}</span> : null}
      </header>
      {top.length > 0 ? (
        <ol className="divide-y">
          {top.map((r, index) => (
            <GearItemRow
              key={r.item.id}
              ranked={r}
              isTop={index === 0}
              closeRuleApplied={index === 0 && top.length >= 2 && top[1].pctOfBest > 100}
            />
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted-foreground">Nothing with stats you can wear here yet.</p>
      )}
      {nextUpgrade ? <GearNextUpgrade upgrade={nextUpgrade} /> : null}
      {unknownEpics.length > 0 ? <GearUnknownEpics items={unknownEpics} /> : null}
    </section>
  );
}
