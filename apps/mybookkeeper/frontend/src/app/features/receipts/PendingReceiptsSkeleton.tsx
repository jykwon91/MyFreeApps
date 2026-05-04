/**
 * Skeleton loader for the PendingReceipts page.
 * Mirrors the loaded page structure: a section header + a card with rows.
 */
export default function PendingReceiptsSkeleton() {
  return (
    <main className="p-4 sm:p-8 space-y-6" aria-busy="true">
      {/* Section header skeleton */}
      <div className="space-y-2">
        <div className="h-6 w-40 bg-muted animate-pulse rounded" />
        <div className="h-4 w-64 bg-muted animate-pulse rounded" />
      </div>

      {/* Receipt rows skeleton */}
      <div className="bg-card border rounded-lg p-4 divide-y">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex items-center justify-between gap-4 py-3"
            data-testid="pending-receipt-row-skeleton"
          >
            <div className="flex-1 space-y-1.5">
              <div className="h-4 w-36 bg-muted animate-pulse rounded" />
              <div className="h-3 w-48 bg-muted animate-pulse rounded" />
              <div className="h-3 w-28 bg-muted animate-pulse rounded" />
            </div>
            <div className="flex gap-2">
              <div className="h-8 w-16 bg-muted animate-pulse rounded" />
              <div className="h-8 w-28 bg-muted animate-pulse rounded" />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
