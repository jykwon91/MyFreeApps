import type { ForeverChange } from "@/games/wow-forever/data/professions/professionTypes";
import type { AddonNote } from "@/games/wow-forever/types/professionsAddon/addonNote";

/** The site's "what's different in Forever" lines; `confirmed` keeps Classic facts labelled as such. */
export function notesOf(changes: readonly ForeverChange[]): AddonNote[] {
  return changes.map((change) => ({ text: change.text, confirmed: change.confidence === "confirmed" }));
}
