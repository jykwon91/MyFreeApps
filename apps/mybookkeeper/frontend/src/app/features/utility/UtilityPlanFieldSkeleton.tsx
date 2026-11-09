/**
 * One labelled field of the utility-plan form, at its loaded size: the
 * FormField label row (text-xs, 16px, mb-1) over a 44px input.
 */
export default function UtilityPlanFieldSkeleton() {
  return (
    <div>
      <div className="h-4 w-24 mb-1 bg-muted rounded" />
      <div className="h-11 bg-muted rounded" />
    </div>
  );
}
