import { useMemo } from "react";
import { Button } from "@platform/ui";
import BisListSlotRow from "@/games/wow-forever/components/gear/bisLists/BisListSlotRow";
import { bisSlotsFor } from "@/games/wow-forever/lib/bisLists/bisSlotFit";
import { bisListSubtitle } from "@/games/wow-forever/lib/bisLists/bisListText";
import { checkSharedList } from "@/games/wow-forever/lib/bisLists/checkSharedList";
import { mainBisSource } from "@/games/wow-forever/lib/bisLists/mainBisSource";
import type { SharedBisList } from "@/games/wow-forever/types/bisLists/sharedBisList";
import type { ClientItemList } from "@/games/wow-forever/types/clientItemList";
import type { GearData } from "@/games/wow-forever/types/gearData";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

interface SharedBisListViewProps {
  /** The decoded link; null = the link couldn't be read. */
  list: SharedBisList | null;
  itemList: ClientItemList;
  gear: GearData;
  faction: PlayerFaction;
  canSave: boolean;
  onSave: (list: SharedBisList) => void;
  onClose: () => void;
}

/** A list someone shared: read-only, with "Save to my lists". */
export default function SharedBisListView({ list, itemList, gear, faction, canSave, onSave, onClose }: SharedBisListViewProps) {
  const checked = useMemo(() => (list ? checkSharedList(list, itemList.byId) : null), [list, itemList]);

  if (!checked) {
    return (
      <section data-testid="bis-shared-invalid" className="rounded-xl border bg-card p-4 space-y-3">
        <h2 className="text-lg font-semibold">This list link doesn't work</h2>
        <p className="text-sm text-muted-foreground">
          It may have been cut short when it was copied. Ask for the link again, or build your own list.
        </p>
        <Button variant="secondary" onClick={onClose}>
          Back to my lists
        </Button>
      </section>
    );
  }

  const shared = checked.list;
  return (
    <section aria-labelledby="bis-shared-name" data-testid="bis-shared-list" className="rounded-xl border bg-card p-4 space-y-4 min-w-0">
      <header className="space-y-1 min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Shared list · read-only</p>
        <h2 id="bis-shared-name" className="text-lg font-semibold break-words">
          {shared.name}
        </h2>
        <p className="text-sm text-muted-foreground">{bisListSubtitle(shared)}</p>
      </header>
      {checked.dropped > 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="bis-shared-dropped">
          {checked.dropped === 1 ? "1 item in the link was left out" : `${checked.dropped} items in the link were left out`}: not in
          the current game files, or not one this class can wear in that slot.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => onSave(shared)} disabled={!canSave}>
          Save to my lists
        </Button>
        <Button variant="secondary" onClick={onClose}>
          Back to my lists
        </Button>
      </div>
      {!canSave ? <p className="text-xs text-muted-foreground">You have as many lists as this page keeps — delete one to save this.</p> : null}
      <ol className="divide-y">
        {bisSlotsFor(shared.classId).map((slot) => {
          const itemId = shared.items[slot.id];
          return (
            <BisListSlotRow
              key={slot.id}
              slot={slot}
              itemId={itemId}
              item={itemId === undefined ? undefined : itemList.byId.get(itemId)}
              source={itemId === undefined ? null : mainBisSource(gear, itemId, shared.classId, faction)}
            />
          );
        })}
      </ol>
    </section>
  );
}
