/**
 * Live WoW Forever server status section.
 *
 * Calls GET /wow/server-status every 90 s while the tab is focused.
 * Renders:
 *   - skeleton while loading
 *   - ruleset badges (Normal, PvP, Roleplay, Roleplay PvP) with green/red dots
 *   - "last checked" relative time
 *   - distinct error state ("couldn't reach Blizzard") with a retry button
 *   - region picker (US default, persisted in localStorage)
 *   - source credit linking to Blizzard's status page
 */
import { LoadingButton } from "@platform/ui";
import { OutboundLink } from "@platform/ui/discord-activity";
import { useCallback, useEffect, useState } from "react";
import {
  SERVER_STATUS_POLLING,
  useGetServerStatusQuery,
} from "@/games/wow-forever/api/wowServerStatusApi";
import { readStored, writeStored } from "@/games/wow-forever/lib/safeLocalStorage";
import { relativeTime } from "@/games/wow-forever/lib/serverStatusTime";
import ServerStatusSkeleton from "./ServerStatusSkeleton";

const REGION_STORAGE_KEY = "mga.wowForever.serverStatus.region.v1";

type Region = "us" | "eu" | "kr" | "tw";

const REGIONS: { value: Region; label: string }[] = [
  { value: "us", label: "Americas" },
  { value: "eu", label: "Europe" },
  { value: "kr", label: "Korea" },
  { value: "tw", label: "Taiwan" },
];

function blizzardStatusUrl(region: Region): string {
  return `https://worldofwarcraft.blizzard.com/en-us/game/status/${region}`;
}

function parseRegion(raw: unknown): Region | null {
  if (raw === "us" || raw === "eu" || raw === "kr" || raw === "tw") return raw;
  return null;
}

/** Dot colour for a ruleset. */
function statusDotClass(online: boolean): string {
  return online
    ? "bg-green-500"
    : "bg-red-500";
}

export default function WowServerStatusSection() {
  const [region, setRegionState] = useState<Region>(() =>
    readStored(REGION_STORAGE_KEY, parseRegion, "us"),
  );

  const setRegion = useCallback((r: Region) => {
    setRegionState(r);
    writeStored(REGION_STORAGE_KEY, r);
  }, []);

  const { data, isLoading, isError, isFetching, refetch } = useGetServerStatusQuery(
    region,
    SERVER_STATUS_POLLING,
  );

  // Keep "last checked" display ticking without a full refetch.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 15_000);
    return () => clearInterval(id);
  }, []);

  const offlineCount = data?.rulesets.filter((r) => !r.online).length ?? 0;

  return (
    <section aria-label="WoW Forever server status" className="rounded-xl border bg-card p-4 sm:p-5 space-y-3">
      {/* Header row: title + region picker */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Server Status
        </h2>
        <select
          aria-label="Region"
          value={region}
          onChange={(e) => setRegion(e.target.value as Region)}
          className="text-sm rounded-md border bg-transparent px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px] sm:min-h-0"
        >
          {REGIONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      {/* Content */}
      {isLoading ? (
        <ServerStatusSkeleton />
      ) : isError ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Couldn&apos;t reach Blizzard&apos;s status page — the servers may still be up.
          </p>
          <LoadingButton
            size="sm"
            variant="secondary"
            isLoading={isFetching}
            loadingText="Retrying…"
            onClick={() => void refetch()}
          >
            Try again
          </LoadingButton>
        </div>
      ) : data ? (
        <div className="space-y-3">
          {/* Summary line */}
          <p className="text-sm font-medium" aria-live="polite">
            {offlineCount === 0 ? (
              <span className="text-green-600 dark:text-green-400">All servers online</span>
            ) : offlineCount === data.rulesets.length ? (
              <span className="text-red-600 dark:text-red-400">All servers offline</span>
            ) : (
              <span className="text-amber-600 dark:text-amber-400">
                {offlineCount} of {data.rulesets.length} servers offline
              </span>
            )}
          </p>

          {/* Individual rulesets */}
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

          {/* Last checked + source credit */}
          {/* tick dependency ensures the relative time refreshes without a refetch */}
          <p className="text-xs text-muted-foreground" aria-live="polite" data-tick={tick}>
            Last checked {relativeTime(data.checked_at)} ·{" "}
            <OutboundLink
              href={blizzardStatusUrl(region)}
              className="underline hover:text-foreground transition-colors"
            >
              Blizzard status page
            </OutboundLink>
          </p>
        </div>
      ) : null}

      {/* Source credit when no data yet (after first load) */}
      {!isLoading && !data && !isError && (
        <p className="text-xs text-muted-foreground">
          Status from{" "}
          <OutboundLink
            href={blizzardStatusUrl(region)}
            className="underline hover:text-foreground transition-colors"
          >
            Blizzard&apos;s server status page
          </OutboundLink>
        </p>
      )}
    </section>
  );
}
