import { PROVENANCE_DETAIL } from "@/games/wow-forever/data/provenance/provenanceLabels";
import { questProvenance } from "@/games/wow-forever/lib/provenance/questProvenance";
import type { ChangeFileEntry } from "@/games/wow-forever/types/changes/changeFileEntry";
import { PROVENANCE } from "@/games/wow-forever/types/provenance/provenance";
import type { ProvenanceTag } from "@/games/wow-forever/types/provenance/provenanceTag";

/**
 * A feed row's badge: the Forever game files, "Seen in game" + date for quests named from our own client cache,
 * or Official for talents (the live trees, from Blizzard's Game Data API).
 */
export function changeProvenance(entry: Pick<ChangeFileEntry, "provenance" | "seenOn">): ProvenanceTag {
  if (entry.provenance === "seen") return questProvenance(entry.seenOn ?? null);
  if (entry.provenance === "published") return { provenance: PROVENANCE.published, detail: PROVENANCE_DETAIL.liveTalents };
  return { provenance: PROVENANCE.client };
}
