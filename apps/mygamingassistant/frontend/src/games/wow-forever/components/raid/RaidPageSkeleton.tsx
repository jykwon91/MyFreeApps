import RaidPageMeta from "@/games/wow-forever/components/raid/RaidPageMeta";
import { RAID_MAIN_CLASS, RAID_SKELETON } from "@/games/wow-forever/data/raidPage";

const CARDS = Array.from({ length: RAID_SKELETON.CARDS }, (_, index) => index);
const ROWS = Array.from({ length: RAID_SKELETON.ROWS }, (_, index) => index);

/** The page's shape while the raid loads (header, then cards of rows), so nothing jumps when it lands. */
export default function RaidPageSkeleton() {
  return (
    <main className={RAID_MAIN_CLASS} aria-busy="true">
      <RaidPageMeta title="Raid" />
      <div className="overflow-hidden rounded-xl border bg-card" aria-hidden>
        <div className="aspect-[4/1] w-full animate-pulse bg-muted" />
        <div className="space-y-3 p-4 sm:p-5">
          <div className="h-7 w-2/3 animate-pulse rounded bg-muted" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
          <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
        </div>
      </div>
      <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-hidden>
        {CARDS.map((card) => (
          <div key={card} className="space-y-2 rounded-lg border bg-card p-3">
            <div className="h-5 w-24 animate-pulse rounded bg-muted" />
            {ROWS.map((row) => (
              <div key={row} className="h-4 animate-pulse rounded bg-muted" />
            ))}
          </div>
        ))}
      </div>
    </main>
  );
}
