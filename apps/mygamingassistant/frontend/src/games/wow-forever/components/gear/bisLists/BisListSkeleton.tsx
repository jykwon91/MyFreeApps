import type { WowClassId } from "@/games/wow-forever/data/classes";
import { bisSlotsFor } from "@/games/wow-forever/lib/bisLists/bisSlotFit";

/** "My lists" while the item data loads: the picker, then a list card with one row per slot. */
export default function BisListSkeleton({ classId }: { classId: WowClassId }) {
  return (
    <div data-testid="bis-list-skeleton" aria-busy="true" className="space-y-4" aria-hidden>
      <div className="flex items-end gap-2">
        <div className="h-11 grow rounded-md bg-muted animate-pulse" />
        <div className="h-11 w-24 rounded-md bg-muted animate-pulse" />
      </div>
      <div className="rounded-xl border bg-card p-4 space-y-4">
        <div className="h-6 w-48 rounded bg-muted animate-pulse" />
        <div className="h-11 w-full max-w-md rounded-md bg-muted animate-pulse" />
        <div className="divide-y">
          {bisSlotsFor(classId).map((slot) => (
            <div key={slot.id} data-testid="bis-slot-skeleton" className="grid gap-1 py-3 sm:grid-cols-[7rem_1fr] sm:gap-3">
              <div className="h-3 w-16 rounded bg-muted animate-pulse" />
              <div className="h-5 w-3/4 rounded bg-muted animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
