import type { VersionSummary } from "../types/recipe/version";

/** Versions newest first; the API lists them oldest first. */
export function newestFirst<Version extends Pick<VersionSummary, "version_number">>(versions: readonly Version[]): Version[] {
  return [...versions].sort((a, b) => b.version_number - a.version_number);
}
