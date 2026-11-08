import { QUEST_PAGE_SIZE } from "@/games/wow-forever/data/quests/questsConfig";

const SKELETON_ROWS = Math.min(QUEST_PAGE_SIZE, 12);
const BAR = "rounded bg-muted/40 animate-pulse";

const ROW_WIDTHS = ["w-2/3", "w-1/2", "w-3/4"] as const;

function rowWidth(index: number): string {
  return ROW_WIDTHS[index % ROW_WIDTHS.length];
}

/** Same shape as the loaded list: search box, filters card, count bar, then quest rows. */
export default function QuestListSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading quests" data-testid="quest-list-skeleton">
      <div className="space-y-1" aria-hidden>
        <div className={`h-5 w-40 ${BAR}`} />
        <div className={`h-11 w-full ${BAR}`} />
      </div>
      <div className={`h-11 w-full sm:hidden ${BAR}`} aria-hidden />
      <div className="hidden space-y-4 rounded-xl border bg-card p-4 sm:block" aria-hidden>
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="space-y-1">
            <div className={`h-5 w-24 ${BAR}`} />
            <div className={`h-11 w-3/4 ${BAR}`} />
          </div>
        ))}
      </div>
      <div className={`h-5 w-32 ${BAR}`} aria-hidden />
      <ul className="divide-y rounded-xl border bg-card" aria-hidden>
        {Array.from({ length: SKELETON_ROWS }, (_, i) => (
          <li key={i} className="flex items-center gap-3 px-3 py-2 sm:px-4" data-testid="quest-list-skeleton-row">
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className={`h-5 ${rowWidth(i)} ${BAR}`} />
              <div className={`h-4 w-1/3 ${BAR}`} />
            </div>
            <div className={`h-5 w-16 shrink-0 ${BAR}`} />
          </li>
        ))}
      </ul>
    </div>
  );
}
