import type { WowRegion } from "@/games/wow-forever/types/wowRegion";

export const DEFAULT_WOW_REGION: WowRegion = "us";

export const WOW_REGIONS: readonly { value: WowRegion; label: string }[] = [
  { value: "us", label: "Americas" },
  { value: "eu", label: "Europe" },
  { value: "kr", label: "Korea" },
  { value: "tw", label: "Taiwan" },
];

export function parseWowRegion(raw: unknown): WowRegion | null {
  return WOW_REGIONS.find((r) => r.value === raw)?.value ?? null;
}
