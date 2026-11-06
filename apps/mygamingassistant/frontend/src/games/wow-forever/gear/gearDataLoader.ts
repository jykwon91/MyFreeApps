import factsUrl from "@/games/wow-forever/data/gear/gearFacts.json?url";
import sourcesUrl from "@/games/wow-forever/data/gear/classic/gearSources.json?url";
import { decodeGearData } from "@/games/wow-forever/gear/decodeGearData";
import type { GearData } from "@/games/wow-forever/types/gearData";
import type { GearFactsFile } from "@/games/wow-forever/types/gearFactsFile";
import type { GearSourcesFile } from "@/games/wow-forever/types/gearSourcesFile";

// ~160 KB together, served as hashed same-origin assets (works in the Discord
// Activity) and fetched the first time the Best gear page opens.
let pending: Promise<GearData> | null = null;

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Gear data request failed: HTTP ${response.status}`);
  return (await response.json()) as T;
}

async function fetchGear(): Promise<GearData> {
  const [facts, sources] = await Promise.all([
    fetchJson<GearFactsFile>(factsUrl),
    fetchJson<GearSourcesFile>(sourcesUrl),
  ]);
  return decodeGearData(facts, sources);
}

/** Gear sources and facts, loaded once. A failed load is forgotten so the next call tries again. */
export function loadGearData(): Promise<GearData> {
  if (!pending) {
    pending = fetchGear().catch((error: unknown) => {
      pending = null;
      throw error;
    });
  }
  return pending;
}
