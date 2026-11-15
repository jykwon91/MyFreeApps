import Skeleton from "@/shared/components/ui/Skeleton";
import Card from "@/shared/components/ui/Card";

/** The three summary cards (revenue, expenses, net profit), in the same grid. */
export default function DashboardSummaryCardsSkeleton() {
  return (
    <section className="grid grid-cols-1 sm:grid-cols-3 gap-4" data-testid="dashboard-skeleton-summary-cards">
      {[0, 1, 2].map((i) => (
        <Card key={i}>
          {/* Heights match the card's text-sm label and text-2xl amount lines. */}
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-8 w-32 mt-1" />
        </Card>
      ))}
    </section>
  );
}
