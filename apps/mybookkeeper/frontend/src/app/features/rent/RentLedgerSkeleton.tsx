import Skeleton from "@/shared/components/ui/Skeleton";

/**
 * Mirrors the loaded panel: schedule line, current-period card (label, big
 * figure, progress bar, footnote), balance line, then the charges heading with
 * three rows. Same sections in the same order and at the same heights, so
 * nothing shifts when the data lands.
 */
export default function RentLedgerSkeleton() {
  return (
    <div className="space-y-4" data-testid="rent-ledger-skeleton" aria-busy="true">
      {/* Schedule summary */}
      <div className="flex items-start justify-between gap-3">
        <Skeleton className="h-5 w-56" />
        <Skeleton className="h-8 w-16" />
      </div>

      {/* Current-period card */}
      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-7 w-48" />
          </div>
          <Skeleton className="h-5 w-20" />
        </div>
        <Skeleton className="h-3 w-full rounded-full" />
        <Skeleton className="h-3 w-52" />
      </div>

      {/* Balance line */}
      <div className="flex items-baseline justify-between gap-3">
        <Skeleton className="h-4 w-44" />
        <Skeleton className="h-3 w-40" />
      </div>

      {/* Charges */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-20" />
        {[0, 1, 2].map((row) => (
          <div key={row} className="flex items-center justify-between gap-2 py-2">
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-28" />
            </div>
            <Skeleton className="h-5 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
