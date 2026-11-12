import { VERSION_COPY } from "@myrecipes/api-client/constants/versions";
import type { VersionSummary } from "@myrecipes/api-client/types/recipe/version";
import { versionNote } from "@myrecipes/api-client/utils/versionNote";
import { versionMeta } from "./versionMeta";

/** A version's row read aloud: "v3, latest, Less salt, Nov 11, 2026, 2 cooks, best rating 4 out of 5". */
export function versionRowLabel(version: VersionSummary, isLatest: boolean): string {
  return [
    `v${version.version_number}`,
    ...(isLatest ? [VERSION_COPY.latest] : []),
    versionNote(version).text,
    ...versionMeta(version).map((part) => part.spoken),
  ].join(", ");
}
