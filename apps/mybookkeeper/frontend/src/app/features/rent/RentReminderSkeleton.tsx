import Skeleton from "@/shared/components/ui/Skeleton";

/**
 * Mirrors the loaded card: settings summary line with its Edit button, the
 * preview box (heading, message, send buttons), then the history heading and
 * two rows — so nothing shifts when the data lands.
 */
export default function RentReminderSkeleton() {
  return (
    <div className="space-y-4" data-testid="rent-reminder-skeleton" aria-busy="true">
      <div className="flex items-start justify-between gap-3">
        <Skeleton className="h-5 w-64" />
        <Skeleton className="h-8 w-16" />
      </div>

      <div className="rounded-lg border p-4 space-y-3">
        <Skeleton className="h-3 w-48" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-9 w-32" />
      </div>

      <div className="space-y-2">
        <Skeleton className="h-4 w-20" />
        {[0, 1].map((row) => (
          <div key={row} className="flex items-center justify-between gap-2 py-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-5 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
