/**
 * Live WoW Forever server status section.
 *
 * Calls GET /wow/server-status every 90 s while the tab is focused.
 * Renders:
 *   - skeleton while loading (via ServerStatusContent)
 *   - ruleset badges (Normal, PvP, Roleplay, Roleplay PvP) with green/red dots
 *   - "last checked" relative time
 *   - distinct error state ("couldn't reach Blizzard") with a retry button
 *   - region picker (the player's saved region, US by default; shared with auction prices)
 *   - source credit linking to Blizzard's status page
 *   - on the hub, a link to the server status page (uptime history and login help)
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  SERVER_STATUS_POLLING,
  useGetServerStatusQuery,
} from "@/games/wow-forever/api/wowServerStatusApi";
import RegionSelect from "@/games/wow-forever/components/shared/RegionSelect";
import { useWowRegion } from "@/games/wow-forever/hooks/useWowRegion";
import type { WowRegion } from "@/games/wow-forever/types/wowRegion";
import ServerStatusContent from "./ServerStatusContent";

function blizzardStatusUrl(region: WowRegion): string {
  return `https://worldofwarcraft.blizzard.com/en-us/game/status/${region}`;
}

interface WowServerStatusSectionProps {
  /** Link to the full server status page; off on that page itself. */
  historyLink?: boolean;
}

export default function WowServerStatusSection({ historyLink = true }: WowServerStatusSectionProps) {
  const [region] = useWowRegion();

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

  return (
    <section aria-label="WoW Forever server status" className="rounded-xl border bg-card p-4 sm:p-5 space-y-3">
      {/* Header row: title + region picker */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Server Status
        </h2>
        <RegionSelect />
      </div>

      <ServerStatusContent
        data={data}
        isLoading={isLoading}
        isError={isError}
        isFetching={isFetching}
        tick={tick}
        blizzardUrl={blizzardStatusUrl(region)}
        onRetry={() => void refetch()}
      />

      {historyLink ? (
        <Link
          to="/wow-forever/server-status"
          className="inline-flex min-h-[44px] items-center text-sm underline underline-offset-2 hover:text-foreground sm:min-h-0"
        >
          Uptime history and login error help
        </Link>
      ) : null}
    </section>
  );
}
