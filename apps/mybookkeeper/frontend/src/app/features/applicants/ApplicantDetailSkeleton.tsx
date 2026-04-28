import Skeleton from "@/shared/components/ui/Skeleton";

/**
 * Skeleton for the ApplicantDetail page. Mirrors the loaded layout exactly:
 * header, stay/contract details, sensitive section, screening, references,
 * video-call notes, activity timeline.
 */
export default function ApplicantDetailSkeleton() {
  return (
    <div className="space-y-6" data-testid="applicant-detail-skeleton">
      {/* Header */}
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <div className="flex gap-2">
          <Skeleton className="h-5 w-24 rounded-full" />
          <Skeleton className="h-3 w-32" />
        </div>
      </div>

      {/* Stay / contract details */}
      <section className="border rounded-lg p-4 space-y-3" data-testid="contract-section-skeleton">
        <Skeleton className="h-4 w-32" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
        </div>
      </section>

      {/* Sensitive */}
      <section className="border rounded-lg p-4 space-y-3" data-testid="sensitive-section-skeleton">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-9 w-40" />
        </div>
        <Skeleton className="h-3 w-2/3" />
      </section>

      {/* Screening */}
      <section className="border rounded-lg p-4 space-y-3" data-testid="screening-section-skeleton">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-12 w-full" />
      </section>

      {/* References */}
      <section className="border rounded-lg p-4 space-y-3" data-testid="references-section-skeleton">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-12 w-full" />
      </section>

      {/* Video-call notes */}
      <section className="border rounded-lg p-4 space-y-3" data-testid="notes-section-skeleton">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-20 w-full" />
      </section>

      {/* Timeline */}
      <Skeleton className="h-12 w-full rounded-lg" />
    </div>
  );
}
