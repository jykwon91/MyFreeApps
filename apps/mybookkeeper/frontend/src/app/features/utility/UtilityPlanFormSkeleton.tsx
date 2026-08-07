/**
 * Placeholder shown while the edit dialog loads the plan.
 *
 * Mirrors the loaded form — two-across pairs, the three-across term row, the
 * full-width provider and fee fields, and the footer — so the dialog does not
 * resize under the operator when the data lands.
 */
export default function UtilityPlanFormSkeleton() {
  return (
    <div
      className="p-5 space-y-4 animate-pulse"
      aria-busy="true"
      data-testid="utility-plan-form-loading"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="h-14 bg-muted rounded" />
        <div className="h-14 bg-muted rounded" />
      </div>
      <div className="h-3 bg-muted rounded w-3/5" />
      <div className="h-14 bg-muted rounded" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="h-14 bg-muted rounded" />
        <div className="h-14 bg-muted rounded" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="h-14 bg-muted rounded" />
        <div className="h-14 bg-muted rounded" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="h-14 bg-muted rounded" />
        <div className="h-14 bg-muted rounded" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="h-14 bg-muted rounded" />
        <div className="h-14 bg-muted rounded" />
        <div className="h-14 bg-muted rounded" />
      </div>
      <div className="h-14 bg-muted rounded" />
      <div className="h-5 bg-muted rounded w-2/5" />
      <div className="flex gap-3 pt-2 justify-end">
        <div className="h-10 w-24 bg-muted rounded" />
        <div className="h-10 w-32 bg-muted rounded" />
      </div>
    </div>
  );
}
