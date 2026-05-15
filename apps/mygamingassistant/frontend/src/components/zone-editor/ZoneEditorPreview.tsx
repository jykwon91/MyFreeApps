/**
 * Preview-mode wrapper for the zone editor.
 *
 * When the operator toggles preview, swap the editor canvas for the same
 * MapZoneOverlay end users see on MapPage. Density is empty (no lineup
 * count tinting) — the point of preview is "where will the clickable
 * areas land", not "how does the live coloring look".
 */
import MapZoneOverlay from "@/components/lineup/MapZoneOverlay";
import type { MapZone } from "@/types/game";
import type { PointObject } from "@/lib/zonePolygon";

export interface ZoneEditorPreviewProps {
  serverZones: MapZone[];
  draftZones: Record<string, PointObject[]>;
  minimapUrl: string | null;
}

export default function ZoneEditorPreview({
  serverZones,
  draftZones,
  minimapUrl,
}: ZoneEditorPreviewProps) {
  // Build MapZone-shaped objects from server identity + draft polygons so
  // the operator sees their in-progress edits as end users would.
  const previewZones: MapZone[] = serverZones.map((z) => ({
    ...z,
    polygon_points: draftZones[z.slug] ?? z.polygon_points,
  }));

  return (
    <div
      className="relative rounded-md border bg-muted/20 overflow-hidden"
      style={{ aspectRatio: "1 / 1" }}
    >
      {minimapUrl ? (
        <img
          src={minimapUrl}
          alt="Minimap preview"
          className="absolute inset-0 w-full h-full object-cover select-none pointer-events-none"
          draggable={false}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
          Minimap not available
        </div>
      )}
      <MapZoneOverlay
        zones={previewZones}
        density={{}}
        selectedZoneSlug={null}
        onZoneClick={() => {
          /* preview only — no-op */
        }}
      />
    </div>
  );
}
