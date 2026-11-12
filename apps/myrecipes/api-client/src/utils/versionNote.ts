import { VERSION_COPY } from "../constants/versions";
import type { VersionNote } from "../types/recipe/version-note";
import type { VersionSummary } from "../types/recipe/version";

/** A version's change note, or what to say when it has none. */
export function versionNote(version: Pick<VersionSummary, "change_note" | "version_number">): VersionNote {
  if (version.change_note) return { text: version.change_note, isPlaceholder: false };
  return {
    text: version.version_number === 1 ? VERSION_COPY.originalRecipe : VERSION_COPY.noChangeNote,
    isPlaceholder: true,
  };
}
