import Skeleton from "@/shared/components/ui/Skeleton";

/**
 * Skeleton for the VendorDetail page. Mirrors the loaded layout exactly:
 * header, contact section, pricing section, notes section.
 */
export default function VendorDetailSkeleton() {
  return (
    <div className="space-y-6" data-testid="vendor-detail-skeleton">
      {/* Header */}
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <div className="flex gap-2">
          <Skeleton className="h-5 w-24 rounded-full" />
          <Skeleton className="h-3 w-32" />
        </div>
      </div>

      {/* Contact info */}
      <section
        className="border rounded-lg p-4 space-y-3"
        data-testid="contact-section-skeleton"
      >
        <Skeleton className="h-4 w-24" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
        </div>
      </section>

      {/* Pricing */}
      <section
        className="border rounded-lg p-4 space-y-3"
        data-testid="pricing-section-skeleton"
      >
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-12 w-full" />
      </section>

      {/* Notes */}
      <section
        className="border rounded-lg p-4 space-y-3"
        data-testid="notes-section-skeleton"
      >
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-12 w-full" />
      </section>
    </div>
  );
}
