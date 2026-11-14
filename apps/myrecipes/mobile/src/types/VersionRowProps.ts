import type { VersionSummary } from "@myrecipes/api-client/types/recipe/version";

export interface VersionRowProps {
  version: VersionSummary;
  isLatest: boolean;
  /** Picking two versions to compare: the row is a checkbox rather than a link to the version. */
  isComparing: boolean;
  isPicked: boolean;
  /** Two others are already picked. */
  isPickDisabled: boolean;
  /** Opens the version in full, or picks it while comparing. */
  onChoose: (version: VersionSummary) => void;
}
