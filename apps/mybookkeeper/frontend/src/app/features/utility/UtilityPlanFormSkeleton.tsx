import UtilityPlanFieldSkeleton from "./UtilityPlanFieldSkeleton";

/**
 * Placeholder shown while the edit dialog loads the plan.
 *
 * Mirrors EditUtilityPlanForm row for row (property line, two-across pairs,
 * rate hint, the three-across term row, the full-width provider and fee
 * fields, bill-credit toggle, and footer) at the loaded sizes, so the dialog
 * does not resize under the operator when the data lands.
 */
export default function UtilityPlanFormSkeleton() {
  return (
    <div
      className="p-5 space-y-4 animate-pulse"
      aria-busy="true"
      data-testid="utility-plan-form-loading"
    >
      <div className="h-5 bg-muted rounded w-1/3" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <UtilityPlanFieldSkeleton />
        <UtilityPlanFieldSkeleton />
      </div>
      <div className="h-4 -mt-2 bg-muted rounded w-3/5" />
      <UtilityPlanFieldSkeleton />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <UtilityPlanFieldSkeleton />
        <UtilityPlanFieldSkeleton />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <UtilityPlanFieldSkeleton />
        <UtilityPlanFieldSkeleton />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <UtilityPlanFieldSkeleton />
        <UtilityPlanFieldSkeleton />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <UtilityPlanFieldSkeleton />
        <UtilityPlanFieldSkeleton />
        <UtilityPlanFieldSkeleton />
      </div>
      <UtilityPlanFieldSkeleton />
      <div className="h-5 bg-muted rounded w-2/5" />
      {/* The minimum-usage pair. A plan opens on its saved service type, and
          every service but internet lands here. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <UtilityPlanFieldSkeleton />
        <UtilityPlanFieldSkeleton />
      </div>
      <div className="flex gap-3 pt-2 justify-end">
        <div className="h-11 w-24 bg-muted rounded" />
        <div className="h-11 w-32 bg-muted rounded" />
      </div>
    </div>
  );
}
