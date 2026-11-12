import { Button } from "@platform/ui";
import { DRILL_DOWN_PAGE_SIZE } from "@mybookkeeper/api-client/constants/transactionPaging";

export interface DrillDownShowMoreProps {
  remaining: number;
  onShowMore: () => void;
}

export default function DrillDownShowMore({ remaining, onShowMore }: DrillDownShowMoreProps) {
  return (
    <div className="flex justify-center px-5 py-4 border-t">
      <Button variant="secondary" className="min-h-[44px]" onClick={onShowMore}>
        Show {Math.min(remaining, DRILL_DOWN_PAGE_SIZE)} more
      </Button>
    </div>
  );
}
