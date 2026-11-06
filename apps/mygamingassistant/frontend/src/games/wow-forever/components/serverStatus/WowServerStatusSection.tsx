/**
 * Live WoW Forever server status section.
 *
 * Calls GET /wow/server-status every 90 s while the tab is focused.
 * Renders:
 *   - skeleton while loading (via ServerStatusContent)
 *   - ruleset badges (Normal, PvP, Roleplay, Roleplay PvP) with green/red dots
 *   - "last checked" relative time
 *   - distinct error state ("couldn't reach Blizzard") with a retry button
 *   - region picker (US default, persisted in localStorage)
 *   - source credit linking to Blizzard's status page
 */
import { useCallback, useEffect, useState } from "react";
import {
  SERVER_STATUS_POLLING,
  useGetServerStatusQuery,
} from "@/games/wow-forever/api/wowServerStatusApi";
import { readStored, writeStored } from "@/games/wow-forever/lib/safeLocalStorage";
import ServerStatusContent from "./ServerStatusContent";

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
