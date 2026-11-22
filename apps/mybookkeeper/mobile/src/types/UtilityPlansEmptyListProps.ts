import type { UtilityPlanFilter } from "./UtilityPlanFilter";

export interface UtilityPlansEmptyListProps {
  isLoading: boolean;
  loadFailed: boolean;
  filter: UtilityPlanFilter;
  canWrite: boolean;
  onRetry: () => void;
  onClearFilter: () => void;
  onAdd: () => void;
}
