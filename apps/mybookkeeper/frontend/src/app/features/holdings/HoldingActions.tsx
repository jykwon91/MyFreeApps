import { Button } from "@platform/ui";
import type { Holding } from "@mybookkeeper/api-client/types/investments/holding";
import { HOLDINGS_MESSAGES as MSG } from "@/shared/lib/holdings-messages";
import { holdingLabel } from "./holding-label";

export interface HoldingActionsProps {
  holding: Holding;
  onEdit: (holding: Holding) => void;
  onRemove: (holding: Holding) => void;
}

/** Edit and Remove for a hand-entered holding; a synced one says where it comes from instead. */
export default function HoldingActions({ holding, onEdit, onRemove }: HoldingActionsProps) {
  if (!holding.is_manual) return <span className="text-xs text-muted-foreground">{MSG.syncedFromBank}</span>;
  const label = holdingLabel(holding);
  return (
    <div className="flex flex-wrap gap-2 justify-end">
      <Button
        type="button" variant="secondary" size="sm" className="min-h-[44px]"
        onClick={() => onEdit(holding)} aria-label={MSG.editLabel(label)} data-testid="holding-edit"
      >
        {MSG.edit}
      </Button>
      <Button
        type="button" variant="secondary" size="sm" className="min-h-[44px]"
        onClick={() => onRemove(holding)} aria-label={MSG.removeLabel(label)} data-testid="holding-remove"
      >
        {MSG.remove}
      </Button>
    </div>
  );
}
