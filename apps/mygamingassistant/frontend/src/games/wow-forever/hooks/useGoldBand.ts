import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { GOLD_BAND, type GoldBand } from "@/games/wow-forever/data/gold/goldTypes";

export const BAND_PARAM = "band";

const BANDS: readonly GoldBand[] = Object.values(GOLD_BAND);

/** The level band a saved level falls in; no level = the start. */
export function bandForLevel(level: number | null): GoldBand {
  if (level === null || level < 20) return GOLD_BAND.early;
  if (level < 40) return GOLD_BAND.mid;
  return GOLD_BAND.late;
}

export function parseBand(raw: string | null): GoldBand | null {
  return BANDS.find((b) => b === raw) ?? null;
}

/** `?band=` wins; otherwise the band for the player's saved level. Changing it replaces history. */
export function useGoldBand(level: number | null): [GoldBand, (band: GoldBand) => void] {
  const [params, setParams] = useSearchParams();
  const band = parseBand(params.get(BAND_PARAM)) ?? bandForLevel(level);
  const update = useCallback(
    (next: GoldBand) =>
      setParams(
        (prev) => {
          const out = new URLSearchParams(prev);
          out.set(BAND_PARAM, next);
          return out;
        },
        { replace: true },
      ),
    [setParams],
  );
  return [band, update];
}
