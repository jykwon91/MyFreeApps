import { TOP_ITEMS_PER_SLOT } from "@/games/wow-forever/data/gear/gearPageConfig";
import { GEAR_SLOT_GROUPS } from "@/games/wow-forever/data/gear/gearSlotGroups";
import type { WowClassId } from "@/games/wow-forever/data/classes";
import { groupUsable } from "@/games/wow-forever/gear/gearFilters";

const ROWS = Array.from({ length: TOP_ITEMS_PER_SLOT }, (_, i) => i);

/** The slot cards while the item data loads: one card per slot this class fills, three rows each. */
export default function GearSlotsSkeleton({ classId }: { classId: WowClassId }) {
  const groups = GEAR_SLOT_GROUPS.filter((g) => groupUsable(g, classId));
  return (
    <div data-testid="gear-slots-skeleton" aria-busy="true" className="grid gap-4 sm:grid-cols-2">
      {groups.map((g) => (
        <div key={g.id} data-testid="gear-slot-skeleton" className="rounded-xl border bg-card p-4 space-y-3" aria-hidden>
          <div className="h-5 w-24 rounded bg-muted animate-pulse" />
          {ROWS.map((r) => (
            <div key={r} className="space-y-1.5">
              <div className="h-4 w-3/4 rounded bg-muted animate-pulse" />
              <div className="h-3 w-1/2 rounded bg-muted animate-pulse" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
