import type { NetWorth } from "@mybookkeeper/api-client/types/net-worth/net-worth";
import EmptyState from "@/shared/components/ui/EmptyState";
import LoadErrorAlert from "@/shared/components/ui/LoadErrorAlert";
import { NET_WORTH_MESSAGES as MSG } from "@/shared/lib/net-worth-messages";
import NetWorthGroupSection from "./NetWorthGroupSection";
import NetWorthHeadline from "./NetWorthHeadline";
import NetWorthHistoryCard from "./NetWorthHistoryCard";
import NetWorthSkeleton from "./NetWorthSkeleton";

export interface NetWorthBodyProps {
  data: NetWorth | undefined;
  isLoading: boolean;
  isError: boolean;
  isRetrying: boolean;
  onRetry: () => void;
  onAddAccount: () => void;
}

export default function NetWorthBody({ data, isLoading, isError, isRetrying, onRetry, onAddAccount }: NetWorthBodyProps) {
  if (isLoading) return <NetWorthSkeleton />;
  if (isError || !data) return <LoadErrorAlert message={MSG.loadFailed} isRetrying={isRetrying} onRetry={onRetry} />;
  if (data.groups.length === 0) {
    return <EmptyState message={MSG.empty} action={{ label: MSG.emptyAction, onClick: onAddAccount }} />;
  }

  return (
    <div className="space-y-6">
      <NetWorthHeadline netWorth={data} />
      <NetWorthHistoryCard />
      {data.groups.map((group) => (
        <NetWorthGroupSection key={group.key} group={group} currency={data.currency} />
      ))}
    </div>
  );
}
