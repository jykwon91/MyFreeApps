import { EmptyState } from "@platform/mobile";
import { UTILITY_PLAN_MESSAGES as MESSAGES } from "../../constants/utilityPlans";
import type { UtilityPlansEmptyListProps } from "../../types/UtilityPlansEmptyListProps";
import { isNarrowed } from "./utilityPlanFilter";
import UtilityPlansSkeleton from "./UtilityPlansSkeleton";

/** What the list shows with no rows: loading, a failed load, no matches for the filter, or no plans yet. */
export default function UtilityPlansEmptyList({ isLoading, loadFailed, filter, canWrite, onRetry, onClearFilter, onAdd }: UtilityPlansEmptyListProps) {
  if (isLoading) return <UtilityPlansSkeleton />;
  if (loadFailed) {
    return <EmptyState action={{ label: MESSAGES.tryAgain, onPress: onRetry }} body={MESSAGES.tryAgainOffer} heading={MESSAGES.couldntLoadList} />;
  }
  if (isNarrowed(filter)) {
    const body = filter.needsRenewing && filter.serviceType === null ? MESSAGES.noMatchesRenewing : MESSAGES.tryAnotherFilter;
    return <EmptyState action={{ label: MESSAGES.filterClear, onPress: onClearFilter }} body={body} heading={MESSAGES.noMatches} />;
  }
  return (
    <EmptyState
      action={canWrite ? { label: MESSAGES.add, onPress: onAdd } : undefined}
      body={canWrite ? MESSAGES.noneBody : MESSAGES.noneViewOnlyBody}
      heading={MESSAGES.noneHeading}
    />
  );
}
