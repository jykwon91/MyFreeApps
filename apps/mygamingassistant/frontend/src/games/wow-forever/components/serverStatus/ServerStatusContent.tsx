/**
 * Content area of the WoW server status section.
 *
 * Separated from WowServerStatusSection to avoid nested JSX ternaries.
 * Uses early returns for each query state: loading, error, data, empty.
 */
import { LoadingButton } from "@platform/ui";
import { OutboundLink } from "@platform/ui/discord-activity";
import type { ServerStatusResponse } from "@/games/wow-forever/types/serverStatus";
import { relativeTime } from "@/games/wow-forever/lib/serverStatusTime";
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

function statusDotClass(online: boolean): string {
  return online ? "bg-green-500" : "bg-red-500";
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
        <p className="text-sm text-muted-foreground">
          Couldn&apos;t reach Blizzard&apos;s status page — the servers may still be up.
        </p>
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

      <ul className="space-y-2" aria-label="Server rulesets">
        {data.rulesets.map((ruleset) => (
          <li key={ruleset.slug} className="flex items-center gap-2 text-sm">
            <span
              className={`inline-block h-2.5 w-2.5 rounded-full flex-shrink-0 ${statusDotClass(ruleset.online)}`}
              aria-hidden
            />
            <span className={ruleset.online ? "" : "text-muted-foreground line-through"}>
              {ruleset.name}
            </span>
            <span className="sr-only">{ruleset.online ? "online" : "offline"}</span>
          </li>
        ))}
      </ul>

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
