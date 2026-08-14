/**
 * Skeleton loader for the InsurancePolicyDetail page.
 * Mirrors the loaded page layout to prevent layout shift.
 */

/** Fields in each `<dl>` of the loaded page, in render order. */
const DETAIL_FIELD_COUNT = 4; // number, coverage, effective, expiration
const COST_FIELD_COUNT = 6; // premium, annualised, fees, total, deductible, wind/hail

/**
 * Each loaded field is a `<dt>` label over a `<dd>` value, so a single bar per
 * field reserves roughly half the height the data needs and the section still
 * grows under the reader. Two bars per field is what the page actually is.
 */
function fieldPlaceholders(count: number) {
  return Array.from({ length: count }, (_, i) => (
    <div key={i} className="space-y-1.5">
      <div className="h-3 bg-muted rounded w-2/3" />
      <div className="h-4 bg-muted rounded" />
    </div>
  ));
}

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
          {fieldPlaceholders(DETAIL_FIELD_COUNT)}
        </div>
      </div>

      {/* Cost section — same two-column grid as the loaded page. A field added
          there needs one here too, or the section jumps as the data lands. */}
      <div className="border rounded-lg p-4 space-y-3">
        <div className="h-4 bg-muted rounded w-1/4" />
        <div className="grid grid-cols-2 gap-3">
          {fieldPlaceholders(COST_FIELD_COUNT)}
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
