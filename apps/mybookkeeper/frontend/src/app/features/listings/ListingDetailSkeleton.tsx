import Skeleton from "@/shared/components/ui/Skeleton";

/**
 * Mirror of the loaded ListingDetail layout: header, rates section, room
 * details section, amenities, external IDs, photos. Same vertical sections,
 * same rough heights, so the skeleton swaps in-place without layout shift.
 */
export default function ListingDetailSkeleton() {
  return (
    <div data-testid="listing-detail-skeleton" className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
        <Skeleton className="h-10 w-20 rounded-md" />
      </div>

      {/* Rates */}
      <section className="border rounded-lg p-4 space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-40" />
      </section>

      {/* Room details */}
      <section className="border rounded-lg p-4 space-y-2">
        <Skeleton className="h-4 w-32" />
        <div className="grid grid-cols-2 gap-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
        </div>
      </section>

      {/* Amenities */}
      <section className="border rounded-lg p-4 space-y-2">
        <Skeleton className="h-4 w-24" />
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-6 w-24 rounded-full" />
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
      </section>

      {/* External IDs */}
      <section className="border rounded-lg p-4 space-y-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-5 w-48" />
      </section>

      {/* Photos */}
      <section className="border rounded-lg p-4 space-y-2">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-40 w-full rounded-md" />
      </section>
    </div>
  );
}
