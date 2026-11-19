import { EmptyState } from "@platform/mobile";
import { DRILL_DOWN_MESSAGES as MESSAGES } from "../../constants/moneyAnalysis";
import TransactionsSkeleton from "../transactions/TransactionsSkeleton";

interface DrillDownEmptyListProps {
  /** The server answered for this filter and nothing matched. */
  isEmpty: boolean;
  isFetching: boolean;
  onRetry: () => void;
}

/** What the drill-down shows with no rows: there are none, they're loading, or they couldn't load. */
export default function DrillDownEmptyList({ isEmpty, isFetching, onRetry }: DrillDownEmptyListProps) {
  if (isEmpty) return <EmptyState body={MESSAGES.noneBody} heading={MESSAGES.noneHeading} />;
  if (isFetching) return <TransactionsSkeleton />;
  return <EmptyState action={{ label: MESSAGES.tryAgain, onPress: onRetry }} body={MESSAGES.checkConnection} heading={MESSAGES.couldntLoad} />;
}
