import { questProvenance } from "@/games/wow-forever/lib/provenance/questProvenance";
import type { ChangeFileEntry } from "@/games/wow-forever/types/changes/changeFileEntry";
import { PROVENANCE } from "@/games/wow-forever/types/provenance/provenance";
import type { ProvenanceTag } from "@/games/wow-forever/types/provenance/provenanceTag";

/** A feed row's badge: the Forever game files, or "Seen in game" + date for quests named from our own client cache. */
export function changeProvenance(entry: Pick<ChangeFileEntry, "provenance" | "seenOn">): ProvenanceTag {
  if (entry.provenance === "seen") return questProvenance(entry.seenOn ?? null);
  return { provenance: PROVENANCE.client };
}
