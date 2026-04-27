import Skeleton from "@/shared/components/ui/Skeleton";

/**
 * Skeleton for the InquiryDetail page. Mirrors the loaded layout: header,
 * action row, inquirer details section, stay details section, notes,
 * quality breakdown, message thread, event timeline.
 */
export default function InquiryDetailSkeleton() {
  return (
    <div className="space-y-6" data-testid="inquiry-detail-skeleton">
      {/* Header */}
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <div className="flex gap-2">
          <Skeleton className="h-5 w-24 rounded-full" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
      </div>
      {/* Action row */}
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-11 w-40" />
        <Skeleton className="h-11 w-24" />
        <Skeleton className="h-11 w-24" />
      </div>
      {/* Inquirer details */}
      <section className="border rounded-lg p-4 space-y-3">
        <Skeleton className="h-4 w-32" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
        </div>
      </section>
      {/* Stay details */}
      <section className="border rounded-lg p-4 space-y-3">
        <Skeleton className="h-4 w-24" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
        </div>
      </section>
      {/* Notes */}
      <section className="border rounded-lg p-4 space-y-3">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-20 w-full" />
      </section>
      {/* Quality breakdown */}
      <section className="border rounded-lg p-4 space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-48" />
        <Skeleton className="h-3 w-44" />
        <Skeleton className="h-3 w-52" />
        <Skeleton className="h-3 w-40" />
      </section>
      {/* Message thread */}
      <section className="space-y-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-16 w-full" />
      </section>
      {/* Event timeline */}
      <Skeleton className="h-12 w-full rounded-lg" />
    </div>
  );
}
