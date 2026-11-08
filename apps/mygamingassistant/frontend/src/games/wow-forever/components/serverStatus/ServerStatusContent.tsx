/**
 * Content area of the WoW server status section.
 *
 * Separated from WowServerStatusSection to avoid nested JSX ternaries.
 * Uses early returns for each query state: loading, error, data, empty.
 */
import { LoadingButton } from "@platform/ui";
import { OutboundLink } from "@platform/ui/discord-activity";
import { SERVER_STATUS_COPY } from "@/games/wow-forever/data/serverStatus/serverStatusCopy";
import type { ServerStatusResponse } from "@/games/wow-forever/types/serverStatus/serverStatusResponse";
import { relativeTime } from "@/games/wow-forever/lib/serverStatusTime";
import ServerRulesetList from "./ServerRulesetList";
import ServerStatusSkeleton from "./ServerStatusSkeleton";
import SummaryLine from "./SummaryLine";

interface ServerStatusContentProps {
  data: ServerStatusResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  tick: number;
  blizzardUrl: string;
  onRetry: () => void;
}

export default function ServerStatusContent({
  data,
  isLoading,
  isError,
  isFetching,
  tick,
  blizzardUrl,
  onRetry,
}: ServerStatusContentProps) {
  if (isLoading) {
    return <ServerStatusSkeleton />;
  }

  if (isError) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">{SERVER_STATUS_COPY.unreachable}</p>
        <LoadingButton
          size="sm"
          variant="secondary"
          isLoading={isFetching}
          loadingText="Retrying…"
          onClick={onRetry}
        >
          Try again
        </LoadingButton>
      </div>
    );
  }

  if (!data) {
    return (
      <p className="text-xs text-muted-foreground">
        Status from{" "}
        <OutboundLink href={blizzardUrl} className="underline hover:text-foreground transition-colors">
          Blizzard&apos;s server status page
        </OutboundLink>
      </p>
    );
  }

  const offlineCount = data.rulesets.filter((r) => !r.online).length;

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium" aria-live="polite">
        <SummaryLine offlineCount={offlineCount} total={data.rulesets.length} />
      </p>

      <ServerRulesetList rulesets={data.rulesets} />

      {/* tick dependency ensures the relative time refreshes without a refetch */}
      <p className="text-xs text-muted-foreground" aria-live="polite" data-tick={tick}>
        Last checked {relativeTime(data.checked_at)} ·{" "}
        <OutboundLink href={blizzardUrl} className="underline hover:text-foreground transition-colors">
          Blizzard status page
        </OutboundLink>
      </p>
    </div>
  );
}
