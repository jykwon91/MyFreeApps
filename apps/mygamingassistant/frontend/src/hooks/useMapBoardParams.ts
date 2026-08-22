/**
 * useMapBoardParams — the map board's view state, read from (and written to)
 * the URL query string.
 *
 * Every filter and mode on MapPage is URL-backed rather than component state,
 * so a board view is shareable, survives a reload, and can be deep-linked into
 * (that is exactly what /lineups/:id does — it redirects here with ?lineup and
 * ?edit set). Extracted out of MapPage so the page component stays a layout
 * shell and each param's parsing rule lives in one readable place.
 *
 *   ?side   attacker | defender          (absent = "any")
 *   ?util   comma-separated utility slugs
 *   ?round  "1" enables round mode
 *   ?zone   target-zone slug filter      (absent = no zone filter)
 *   ?view   "grid" | "list"              (absent = list)
 *   ?pins   stand | target | both | off  (absent = both)
 *   ?edit   lineup id open in the pin editor (superuser)
 */
import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import type { PinMode } from "@/components/lineup/MapLineupPins";

/**
 * Pins default to "both" — the operator wants to eyeball placements without
 * reaching for the toggle. "Off" is an explicit choice, persisted as ?pins=off:
 * an ABSENT param means "not chosen" → default on, so Off has to write a real
 * value or it could never survive a reload or stick in a shared URL.
 */
function parsePinMode(raw: string | null): PinMode | null {
  if (raw === "stand" || raw === "target" || raw === "both") return raw;
  if (raw === "off") return null;
  return "both";
}

export function useMapBoardParams() {
  const [searchParams, setSearchParams] = useSearchParams();

  /** Set a param to `value`, or drop it entirely when `value` is null/empty. */
  const updateParam = useCallback(
    (key: string, value: string | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value) next.set(key, value);
          else next.delete(key);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  return {
    searchParams,
    updateParam,
    side: searchParams.get("side") ?? "any",
    util: searchParams.get("util") ?? "",
    isRoundMode: searchParams.get("round") === "1",
    // Zone filter — narrows the rendered lineups to a single target zone. Set
    // by clicking a zone polygon (or zone name in the fallback list) on the
    // minimap sidebar. Click the active zone again to clear.
    zoneFilter: searchParams.get("zone") ?? null,
    // Render mode. List is the default because the grid mounts up to 4 looping
    // <video> tags per visible card, pushing browser CPU to ~10% on a dense
    // map; list defers all video decoding until a specific row is opened.
    viewMode: searchParams.get("view") === "grid" ? ("grid" as const) : ("list" as const),
    pinMode: parsePinMode(searchParams.get("pins")),
    // Lineup currently open in the pin editor — the same param usePinEditor
    // reads. Passed to the list board so the matching row highlights + scrolls
    // into view, linking the editor panel to the actual lineup row.
    editingLineupId: searchParams.get("edit"),
  };
}
