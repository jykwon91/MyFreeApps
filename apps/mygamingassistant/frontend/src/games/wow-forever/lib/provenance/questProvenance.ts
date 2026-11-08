import { PROVENANCE } from "@/games/wow-forever/types/provenance/provenance";
import type { ProvenanceTag } from "@/games/wow-forever/types/provenance/provenanceTag";

/**
 * A dungeon quest's title, levels, objectives and rewards: seen in the
 * operator's Forever client (with the day it was seen), else Classic data.
 * `seenOn` is a calendar day (YYYY-MM-DD), so it's shown in UTC — never shifted a day by the time zone.
 */
export function questProvenance(seenOn: string | null): ProvenanceTag {
  if (!seenOn) return { provenance: PROVENANCE.classic };
  return { provenance: PROVENANCE.seen, date: new Date(seenOn).toLocaleDateString(undefined, { timeZone: "UTC" }) };
}
