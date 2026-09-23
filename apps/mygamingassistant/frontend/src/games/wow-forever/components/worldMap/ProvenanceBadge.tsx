import { Badge } from "@platform/ui";
import { POI_SOURCE, type MapPoi } from "@/games/wow-forever/types/worldMap";

interface ProvenanceBadgeProps {
  poi: Pick<MapPoi, "source" | "capturedAt">;
}

/** Where a location comes from — Classic data may be out of date for Forever. */
export default function ProvenanceBadge({ poi }: ProvenanceBadgeProps) {
  if (poi.source === POI_SOURCE.captured) {
    const date = poi.capturedAt ? new Date(poi.capturedAt).toLocaleDateString() : "";
    return <Badge color="green" label={`Captured in Forever ${date}`.trim()} />;
  }
  return <Badge color="yellow" label="Classic location — may differ in Forever" />;
}
