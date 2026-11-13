import { SPELLBOOK_SKELETON_ROWS, SPELLBOOK_SKELETON_TABS } from "@/games/wow-forever/data/spellbook/spellbookConfig";

const BAR = "rounded bg-muted animate-pulse";

/** Same shape as the loaded spellbook: the filters card (search, level, chips), a tab heading, then spell cards. */
export default function SpellbookSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading the spellbook" data-testid="spellbook-skeleton">
      <div className="space-y-3 rounded-xl border bg-card p-3 sm:p-4" aria-hidden>
        <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
          <div className="space-y-1">
            <div className={`h-4 w-16 ${BAR}`} />
            <div className={`h-11 w-full ${BAR}`} />
          </div>
          <div className="space-y-1">
            <div className={`h-4 w-16 ${BAR}`} />
            <div className={`h-11 w-full ${BAR}`} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: SPELLBOOK_SKELETON_TABS }, (_, i) => (
            <div key={i} className={`h-11 w-28 rounded-full ${BAR}`} />
          ))}
        </div>
        <div className={`h-11 w-48 rounded-full ${BAR}`} />
      </div>
      <div className={`h-6 w-40 ${BAR}`} aria-hidden />
      <ul className="space-y-3" aria-hidden>
        {Array.from({ length: SPELLBOOK_SKELETON_ROWS }, (_, i) => (
          <li key={i} className="flex gap-3 rounded-xl border bg-card p-3" data-testid="spellbook-skeleton-row">
            <div className={`h-8 w-8 shrink-0 ${BAR}`} />
            <div className="flex-1 space-y-2">
              <div className={`h-5 w-1/3 ${BAR}`} />
              <div className={`h-4 w-1/4 ${BAR}`} />
              <div className={`h-4 w-full ${BAR}`} />
              <div className={`h-11 w-32 ${BAR}`} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
