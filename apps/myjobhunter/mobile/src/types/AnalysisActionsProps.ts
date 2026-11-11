export interface AnalysisActionsProps {
  /** Set once it's been added, when the actions turn to viewing it. */
  appliedApplicationId: string | null;
  isApplying: boolean;
  onApply: () => Promise<void>;
  onAnalyzeAnother: () => void;
  onViewApplications: () => void;
}
