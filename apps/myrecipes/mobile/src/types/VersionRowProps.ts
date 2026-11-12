import type { VersionSummary } from "@myrecipes/api-client/types/recipe/version";

export interface VersionRowProps {
  version: VersionSummary;
  isLatest: boolean;
  /** Picking two versions to compare: the row is a checkbox rather than a link to its diff. */
  isComparing: boolean;
  isPicked: boolean;
  /** Two others are already picked. */
  isPickDisabled: boolean;
  /** Opens its diff, or picks it while comparing. */
  onChoose: (version: VersionSummary) => void;
}
