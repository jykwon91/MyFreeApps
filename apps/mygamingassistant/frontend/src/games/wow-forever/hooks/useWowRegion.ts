import { useSyncExternalStore } from "react";
import { DEFAULT_WOW_REGION, parseWowRegion } from "@/games/wow-forever/data/wowRegions";
import { readStored, writeStored } from "@/games/wow-forever/lib/safeLocalStorage";
import type { WowRegion } from "@/games/wow-forever/types/wowRegion";

/**
 * The server status page's region, saved on this device. Auction prices don't
 * use it: they are US only (`useAuctionPrices`).
 */
export const REGION_STORAGE_KEY = "mga.wowForever.serverStatus.region.v1";

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function read(): WowRegion {
  return readStored(REGION_STORAGE_KEY, parseWowRegion, DEFAULT_WOW_REGION);
}

function setRegion(region: WowRegion): void {
  writeStored(REGION_STORAGE_KEY, region);
  for (const listener of listeners) listener();
}

/** One region for every server status section, so changing it in one place changes it everywhere. */
export function useWowRegion(): [WowRegion, (region: WowRegion) => void] {
  const region = useSyncExternalStore(subscribe, read, () => DEFAULT_WOW_REGION);
  return [region, setRegion];
}
