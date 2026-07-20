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
 *   - Superuser  → select the lineup for editing (opens PinEditPanel)
 *   - Public     → smooth-scroll the board to that lineup's target-zone
 *     section, reusing the existing zoneAnchorId scroll anchors.
 */
import GlanceBoardMinimapSidebar from "./GlanceBoardMinimapSidebar";
import PinModeToggle from "./PinModeToggle";
import PinEditPanel from "./PinEditPanel";
import { usePinEditor } from "@/hooks/usePinEditor";
import { zoneAnchorId } from "./glanceBoardUtils";
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
}: Props) {
  const editor = usePinEditor({ lineups, isSuperuser });

  function handlePinSelect(lineupId: string) {
    if (isSuperuser) {
      editor.setSelected(lineupId);
      return;
    }
    // Public viewer — jump the board to the lineup's target-zone section.
    const l = lineups.find((x) => x.id === lineupId);
    const slug = l?.target_zone?.slug;
    if (slug) {
      document
        .getElementById(zoneAnchorId(slug))
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
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
        onPinSelect={handlePinSelect}
      />

      {isSuperuser && pinMode && (
        <PinEditPanel editor={editor} minimapUrl={minimapUrl} />
      )}
    </div>
  );
}
