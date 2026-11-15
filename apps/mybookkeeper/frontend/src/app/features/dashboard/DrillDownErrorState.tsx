import LoadErrorAlert from "@/shared/components/ui/LoadErrorAlert";
import { DRILL_DOWN_LOAD_ERROR } from "@/shared/lib/drill-down-messages";

export interface DrillDownErrorStateProps {
  isRetrying: boolean;
  onRetry: () => void;
}

export default function DrillDownErrorState({ isRetrying, onRetry }: DrillDownErrorStateProps) {
  return (
    <div className="p-5">
      <LoadErrorAlert message={DRILL_DOWN_LOAD_ERROR} isRetrying={isRetrying} onRetry={onRetry} />
    </div>
  );
}
