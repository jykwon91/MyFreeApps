import { MAX_SHOWN_PCT, MIN_SHOWN_PCT } from "@/games/wow-forever/data/itemCompare/upgradeVerdictConfig";

/** "+12%" / "−8%" (a real minus sign); "+100%+" past MAX_SHOWN_PCT, never below "−100%"; "" when there's no %. */
export function formatVerdictPct(pct: number | null): string {
  if (pct === null) return "";
  if (pct > MAX_SHOWN_PCT) return `+${MAX_SHOWN_PCT}%+`;
  if (pct > 0) return `+${pct}%`;
  return `−${Math.abs(Math.max(pct, MIN_SHOWN_PCT))}%`;
}
