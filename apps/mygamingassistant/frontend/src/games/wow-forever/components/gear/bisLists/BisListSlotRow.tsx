import type { ReactNode } from "react";
import BisListItemLine from "@/games/wow-forever/components/gear/bisLists/BisListItemLine";
import type { BisSlot } from "@/games/wow-forever/data/bisLists/bisSlots";
import type { ClientItem } from "@/games/wow-forever/types/clientItem";
import type { GearSource } from "@/games/wow-forever/types/gearSource";

interface BisListSlotRowProps {
  slot: BisSlot;
  itemId: number | undefined;
  item: ClientItem | undefined;
  source: GearSource | null;
  /** The row's controls (own lists only); a shared list's rows are read-only. */
  children?: ReactNode;
}

/** One row of a list: the slot, what's in it, then (when editable) its controls. */
export default function BisListSlotRow({ slot, itemId, item, source, children }: BisListSlotRowProps) {
  const labelId = `bis-slot-${slot.id}`;
  return (
    <li aria-labelledby={labelId} data-testid="bis-slot-row" data-slot={slot.id} className="space-y-2 py-3 min-w-0">
      <div className="grid gap-1 sm:grid-cols-[7rem_1fr] sm:gap-3 min-w-0">
        <span id={labelId} className="text-xs font-medium text-muted-foreground sm:pt-1">
          {slot.label}
        </span>
        <BisListItemLine itemId={itemId} item={item} source={source} />
      </div>
      {children}
    </li>
  );
}
