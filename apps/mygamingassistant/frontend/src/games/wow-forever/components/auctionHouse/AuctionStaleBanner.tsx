import { useNow } from "@/games/wow-forever/hooks/useNow";
import { relativeTime } from "@/games/wow-forever/lib/serverStatusTime";
import { pricesAreOld } from "@/games/wow-forever/prices/priceFreshness";

/** Re-reads the clock this often (the same beat as the price credit line). */
const CLOCK_MS = 60_000;

/** A visible warning above the list when Blizzard's snapshot is older than the usual refresh gap. */
export default function AuctionStaleBanner({ sourceUpdatedAt }: { sourceUpdatedAt: string | null }) {
  const now = useNow(CLOCK_MS);
  if (!pricesAreOld(sourceUpdatedAt, now)) return null;
  const age = sourceUpdatedAt ? `Blizzard's snapshot is from ${relativeTime(sourceUpdatedAt)}` : "We can't tell when Blizzard's snapshot was taken";
  return (
    <div
      role="status"
      className="rounded-xl border border-amber-600/50 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/50 dark:bg-amber-950/40 dark:text-amber-200"
      data-testid="auction-stale-banner"
    >
      <strong className="font-semibold">These prices are old.</strong> {age}, so some of what you see may no longer be on sale.
    </div>
  );
}
