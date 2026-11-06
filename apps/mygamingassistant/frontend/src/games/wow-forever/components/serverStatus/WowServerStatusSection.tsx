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
 */
import { useEffect, useState } from "react";
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

export default function WowServerStatusSection() {
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
    </section>
  );
}
