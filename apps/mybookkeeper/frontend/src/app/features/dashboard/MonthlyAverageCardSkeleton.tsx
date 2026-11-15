import Skeleton from "@/shared/components/ui/Skeleton";
import Card from "@/shared/components/ui/Card";

/** Matches MonthlyAverageCard: title row, then revenue / expenses / profit. */
export default function MonthlyAverageCardSkeleton() {
  return (
    <Card>
      <div className="flex items-baseline justify-between mb-4" data-testid="monthly-average-card-skeleton">
        {/* Heights match the card's line heights, so swapping it in or out
            doesn't move what's below. */}
        <Skeleton className="h-6 w-36" />
        <Skeleton className="h-4 w-24" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i}>
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-7 w-28 mt-1" />
          </div>
        ))}
      </div>
    </Card>
  );
}
