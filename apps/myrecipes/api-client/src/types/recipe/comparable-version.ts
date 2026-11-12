import type { VersionSummary } from "./version";

/** What ordering two versions for a comparison needs to know about each. */
export type ComparableVersion = Pick<VersionSummary, "id" | "version_number">;
