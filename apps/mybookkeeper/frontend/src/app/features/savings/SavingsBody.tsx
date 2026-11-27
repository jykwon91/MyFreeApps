import type { SavingsCategory } from "@mybookkeeper/api-client/types/savings/savings-category";
import type { SavingsOverview } from "@mybookkeeper/api-client/types/savings/savings-overview";
import EmptyState from "@/shared/components/ui/EmptyState";
import LoadErrorAlert from "@/shared/components/ui/LoadErrorAlert";
import { SAVINGS_MESSAGES as MSG } from "@/shared/lib/savings-messages";
import SavingsHeader from "./SavingsHeader";
import SavingsIdeaList from "./SavingsIdeaList";
import SavingsOffState from "./SavingsOffState";
import SavingsRunStatus from "./SavingsRunStatus";
import SavingsSkeleton from "./SavingsSkeleton";

export interface SavingsBodyProps {
  data: SavingsOverview | undefined;
  isLoading: boolean;
  isError: boolean;
  isRetrying: boolean;
  onRetry: () => void;
  category: SavingsCategory | null;
  onCategoryChange: (next: SavingsCategory | null) => void;
}

function emptyMessage(data: SavingsOverview): string {
  return data.last_researched_at === null ? MSG.emptyFirstRun : MSG.emptyAll;
}

export default function SavingsBody({
  data, isLoading, isError, isRetrying, onRetry, category, onCategoryChange,
}: SavingsBodyProps) {
  if (isLoading) return <SavingsSkeleton />;
  if (isError || !data) return <LoadErrorAlert message={MSG.loadFailed} isRetrying={isRetrying} onRetry={onRetry} />;
  if (!data.research_enabled) return <SavingsOffState />;

  return (
    <div className="space-y-6">
      <SavingsHeader overview={data} />
      <SavingsRunStatus runInProgress={data.run_in_progress} latestRun={data.latest_run} />
      {data.ideas.length === 0 ? (
        <EmptyState message={emptyMessage(data)} />
      ) : (
        <SavingsIdeaList ideas={data.ideas} category={category} onCategoryChange={onCategoryChange} />
      )}
      <p className="text-xs text-muted-foreground" data-testid="savings-disclaimer">{MSG.disclaimer}</p>
    </div>
  );
}
