import { PROVENANCE } from "@/games/wow-forever/types/provenance/provenance";
import type { ProvenanceTag } from "@/games/wow-forever/types/provenance/provenanceTag";
import { POI_SOURCE, type MapPoi } from "@/games/wow-forever/types/worldMap";

/** A World Map location's badge: captured in Forever by the addon → Seen in game (with its date), else Classic data. */
export function poiProvenance(poi: Pick<MapPoi, "source" | "capturedAt">): ProvenanceTag {
  if (poi.source !== POI_SOURCE.captured) return { provenance: PROVENANCE.classic };
  const date = poi.capturedAt ? new Date(poi.capturedAt).toLocaleDateString() : undefined;
  return { provenance: PROVENANCE.seen, date };
}
