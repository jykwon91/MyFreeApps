/**
 * useDesignKnobs — URL-backed direct-manipulation knobs for the storyboard
 * tile, so the operator can A/B layout decisions in the browser instead of
 * describing them back via chat. Read by GlanceBoard / GlanceBoardTile when
 * present; absent values fall back to the shipped defaults so the panel is
 * additive (existing URLs unaffected).
 *
 * URL params (all optional):
 *   stand=still|clip       — STAND pane content
 *   aim=still|clip         — AIM pane content
 *   dot=on|off             — AIM anchor dot
 *   landing=clip|text      — LANDING pane content
 *   cols=1|2|3             — tiles per row in the grid
 */
import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

export type PaneMode = "still" | "clip";
export type LandingMode = "clip" | "text";
export type TilesPerRow = 1 | 2 | 3;

export interface DesignKnobs {
  standMode: PaneMode;
  aimMode: PaneMode;
  showAimDot: boolean;
  landingMode: LandingMode;
  tilesPerRow: TilesPerRow;
}

export const DEFAULT_KNOBS: DesignKnobs = {
  standMode: "clip",
  aimMode: "clip",
  showAimDot: true,
  landingMode: "clip",
  tilesPerRow: 3,
};

function parsePaneMode(raw: string | null, fallback: PaneMode): PaneMode {
  return raw === "still" || raw === "clip" ? raw : fallback;
}

function parseLandingMode(raw: string | null, fallback: LandingMode): LandingMode {
  return raw === "clip" || raw === "text" ? raw : fallback;
}

function parseTilesPerRow(raw: string | null, fallback: TilesPerRow): TilesPerRow {
  const n = Number(raw);
  return n === 1 || n === 2 || n === 3 ? (n as TilesPerRow) : fallback;
}

export interface UseDesignKnobsReturn {
  knobs: DesignKnobs;
  setKnob: <K extends keyof DesignKnobs>(key: K, value: DesignKnobs[K]) => void;
  reset: () => void;
}

export function useDesignKnobs(): UseDesignKnobsReturn {
  const [searchParams, setSearchParams] = useSearchParams();

  const knobs = useMemo<DesignKnobs>(
    () => ({
      standMode:   parsePaneMode(searchParams.get("stand"),   DEFAULT_KNOBS.standMode),
      aimMode:     parsePaneMode(searchParams.get("aim"),     DEFAULT_KNOBS.aimMode),
      showAimDot:  searchParams.get("dot") === "off" ? false : DEFAULT_KNOBS.showAimDot,
      landingMode: parseLandingMode(searchParams.get("landing"), DEFAULT_KNOBS.landingMode),
      tilesPerRow: parseTilesPerRow(searchParams.get("cols"),   DEFAULT_KNOBS.tilesPerRow),
    }),
    [searchParams],
  );

  const setKnob = useCallback(
    <K extends keyof DesignKnobs>(key: K, value: DesignKnobs[K]) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          const paramKey =
            key === "standMode"   ? "stand"   :
            key === "aimMode"     ? "aim"     :
            key === "showAimDot"  ? "dot"     :
            key === "landingMode" ? "landing" :
            "cols";
          const paramValue =
            key === "showAimDot"
              ? (value ? "on" : "off")
              : String(value);
          const isDefault =
            (key === "standMode"   && value === DEFAULT_KNOBS.standMode)   ||
            (key === "aimMode"     && value === DEFAULT_KNOBS.aimMode)     ||
            (key === "showAimDot"  && value === DEFAULT_KNOBS.showAimDot)  ||
            (key === "landingMode" && value === DEFAULT_KNOBS.landingMode) ||
            (key === "tilesPerRow" && value === DEFAULT_KNOBS.tilesPerRow);
          if (isDefault) {
            next.delete(paramKey);
          } else {
            next.set(paramKey, paramValue);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const reset = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("stand");
        next.delete("aim");
        next.delete("dot");
        next.delete("landing");
        next.delete("cols");
        return next;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  return { knobs, setKnob, reset };
}
