/**
 * Skeleton loader for the InsurancePolicyDetail page.
 * Mirrors the loaded page layout to prevent layout shift.
 */
export default function InsurancePolicyDetailSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" data-testid="insurance-policy-detail-skeleton">
      {/* Header */}
      <div className="space-y-2">
        <div className="h-6 bg-muted rounded w-1/2" />
        <div className="h-4 bg-muted rounded w-1/4" />
      </div>

      {/* Details section */}
      <div className="border rounded-lg p-4 space-y-3">
        <div className="h-4 bg-muted rounded w-1/4" />
        <div className="grid grid-cols-2 gap-3">
          <div className="h-4 bg-muted rounded" />
          <div className="h-4 bg-muted rounded" />
          <div className="h-4 bg-muted rounded" />
          <div className="h-4 bg-muted rounded" />
        </div>
      </div>

      {/* Attachments section */}
      <div className="border rounded-lg p-4 space-y-3">
        <div className="h-4 bg-muted rounded w-1/4" />
        <div className="h-4 bg-muted rounded w-3/4" />
        <div className="h-4 bg-muted rounded w-1/2" />
      </div>
    </div>
  );
}
