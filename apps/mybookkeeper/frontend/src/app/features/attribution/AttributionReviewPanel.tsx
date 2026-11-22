import { Inbox } from "lucide-react";
import LoadErrorAlert from "@/shared/components/ui/LoadErrorAlert";
import Card from "@/shared/components/ui/Card";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import { useGetAttributionReviewQueueQuery } from "@mybookkeeper/api-client/store/attributionApi";
import AttributionReviewItem from "./AttributionReviewItem";
import AttributionReviewSkeleton from "./AttributionReviewSkeleton";

export default function AttributionReviewPanel() {
  const { data, isLoading, isFetching, refetch } = useGetAttributionReviewQueueQuery();

  if (isLoading) return <AttributionReviewSkeleton />;

  // No queue to show: it failed to load (or a retry is running). Never read that as "all caught up".
  // A failed refetch keeps the rows already loaded, like the other lists.
  if (!data) {
    return (
      <LoadErrorAlert message="I couldn't load your payments to review." isRetrying={isFetching} onRetry={() => void refetch()} />
    );
  }

  const items = data.items;
  const pendingCount = data.pending_count;

  return (
    <section className="space-y-3">
      <SectionHeader
        title={
          pendingCount > 0
            ? `Got ${pendingCount} payment${pendingCount === 1 ? "" : "s"} waiting for you to review.`
            : "Attribution Review"
        }
        subtitle={
          pendingCount > 0
            ? "Tell me who sent each payment — I'll remember for next time."
            : undefined
        }
      />

      {items.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
            <Inbox className="h-8 w-8" aria-hidden="true" />
            <p className="text-sm">All caught up — no payments need your review.</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <AttributionReviewItem key={item.id} item={item} />
          ))}
        </div>
      )}
    </section>
  );
}
