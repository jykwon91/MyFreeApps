import type { CompareMode } from "@mybookkeeper/api-client/types/analytics/compare-mode";
import type { ReactNode } from "react";
import type { AnalysisChoice } from "./AnalysisChoice";
import type { AnalysisSelection } from "./AnalysisSelection";

export interface AnalysisControlsProps {
  choices: readonly AnalysisChoice[];
  selection: AnalysisSelection;
  onSelection: (selection: AnalysisSelection) => void;
  compare: CompareMode;
  onCompare: (mode: CompareMode) => void;
  properties: readonly { id: string; name: string }[];
  propertyIds: readonly string[];
  onPropertyIds: (ids: string[]) => void;
  /** The most properties that can be chosen, when the numbers behind the screen can't take more. */
  maxProperties?: number;
  /** True when the list of years could not be loaded, so only the usual periods are offered. */
  yearsFailed?: boolean;
  onRetryYears?: () => Promise<void>;
  today: Date;
  /** More pickers of the screen's own, shown under these. */
  children?: ReactNode;
}
