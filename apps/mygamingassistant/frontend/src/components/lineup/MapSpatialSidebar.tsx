/**
 * MapSpatialSidebar — the left column of the glance board.
 *
 * Composes the three spatial surfaces so MapPage stays thin:
 *   1. PinModeToggle       — Off/Stand/Target/Both (public; drives ?pins=)
 *   2. GlanceBoardMinimapSidebar — minimap + zone polygons + the lineup-pin
 *      overlay (MapLineupPins) when a pin mode is active
 *   3. PinEditPanel        — operator-only nudge surface (?edit=<id>)
 *
 * Pin selection routing:
 *   - Public viewer: clicking a pin sets ?lineup=<id>, which the list board's
 *     LineupListRow reads to scroll the matching row into view and expand its
 *     storyboard. A pin click is a "show me this lineup" action.
 *   - Superuser: clicking a pin ALSO sets ?edit=<id>, opening the pin editor
 *     right here in the sidebar. Bulk pin-placement is the operator's core
 *     workflow, so a pin click IS "let me place this one" — the editor's
 *     Save & Next then walks the rest of the queue. (The expanded row's
 *     "Adjust pin" button remains a second entry point for the same ?edit=.)
 */
import { useSearchParams } from "react-router-dom";
import GlanceBoardMinimapSidebar from "./GlanceBoardMinimapSidebar";
import PinModeToggle from "./PinModeToggle";
import PinEditPanel from "./PinEditPanel";
import { usePinEditor } from "@/hooks/usePinEditor";
import type { PinMode } from "./MapLineupPins";
import type { Lineup, MapZone, ZoneDensity } from "@/types/game";

interface Props {
  minimapUrl: string | null;
  zones: MapZone[];
  density: ZoneDensity;
  onZoneClick: (zoneSlug: string) => void;
  activeZoneSlug: string | null;
  lineups: Lineup[];
  pinMode: PinMode | null;
  onPinModeChange: (next: PinMode | null) => void;
  isSuperuser: boolean;
  /** Lineup hovered in the list board — forwarded to the minimap so its
   *  pin(s) highlight. Null when nothing is hovered. */
  highlightedLineupId?: string | null;
}

export default function MapSpatialSidebar({
  minimapUrl,
  zones,
  density,
  onZoneClick,
  activeZoneSlug,
  lineups,
  pinMode,
  onPinModeChange,
  isSuperuser,
  highlightedLineupId = null,
}: Props) {
  const editor = usePinEditor({ lineups, isSuperuser });
  const [, setSearchParams] = useSearchParams();

  function handlePinSelect(lineupId: string) {
    // ?lineup=<id> tells LineupListRow to scroll its row into view + expand the
    // storyboard. For a superuser, ALSO set ?edit=<id> so the pin editor opens
    // immediately in this sidebar (the placement workflow) — otherwise a pin
    // click appears to "do nothing" from the sidebar because the only visible
    // effect is a row expanding in the far-right column. Public viewers get the
    // view-only behavior (no ?edit).
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("lineup", lineupId);
        if (isSuperuser) next.set("edit", lineupId);
        else next.delete("edit");
        return next;
      },
      { replace: true },
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <PinModeToggle mode={pinMode} onChange={onPinModeChange} />

      <GlanceBoardMinimapSidebar
        minimapUrl={minimapUrl}
        zones={zones}
        density={density}
        onZoneClick={onZoneClick}
        activeZoneSlug={activeZoneSlug}
        lineups={lineups}
        pinMode={pinMode}
        selectedLineupId={editor.selectedLineupId}
        highlightedLineupId={highlightedLineupId}
        onPinSelect={handlePinSelect}
      />

      {/* Show the editor whenever a lineup is selected for editing (via an
          ?edit= deep link or a pin click) — NOT only when the Pins toggle is
          on. Arriving at ?edit=<id> should open the editor directly; requiring
          the operator to first flip the Pins toggle off "Off" was a hidden
          gate that made deep links appear to do nothing. */}
      {isSuperuser && (pinMode || editor.selectedLineup) && (
        <PinEditPanel editor={editor} minimapUrl={minimapUrl} />
      )}
    </div>
  );
}
