import { useState, type Dispatch } from "react";
import { showSuccess } from "@platform/ui";
import { BIS_LIST_PHASE } from "@/games/wow-forever/data/bisLists/bisListPhases";
import BisListActions from "@/games/wow-forever/components/gear/bisLists/BisListActions";
import BisListEditableSlotRow from "@/games/wow-forever/components/gear/bisLists/BisListEditableSlotRow";
import BisListRenameForm from "@/games/wow-forever/components/gear/bisLists/BisListRenameForm";
import { MAX_BIS_LISTS } from "@/games/wow-forever/data/bisLists/bisListConfig";
import type { BisSlot } from "@/games/wow-forever/data/bisLists/bisSlots";
import { bisSlotsFor } from "@/games/wow-forever/lib/bisLists/bisSlotFit";
import { bisListProgress, bisListSubtitle, bisSlotLabels } from "@/games/wow-forever/lib/bisLists/bisListText";
import { cleanBisListName, duplicateBisListName } from "@/games/wow-forever/lib/bisLists/bisListName";
import { mainBisSource } from "@/games/wow-forever/lib/bisLists/mainBisSource";
import { newBisListId } from "@/games/wow-forever/lib/bisLists/newBisList";
import { clashingSlots } from "@/games/wow-forever/lib/bisLists/placeBisItem";
import type { BisList } from "@/games/wow-forever/types/bisLists/bisList";
import type { BisListAction } from "@/games/wow-forever/types/bisLists/bisListAction";
import type { ClientItem } from "@/games/wow-forever/types/clientItem";
import type { ClientItemList } from "@/games/wow-forever/types/clientItemList";
import type { GearData } from "@/games/wow-forever/types/gearData";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

interface BisListEditorProps {
  list: BisList;
  listCount: number;
  itemList: ClientItemList;
  gear: GearData;
  faction: PlayerFaction;
  dispatch: Dispatch<BisListAction>;
}

/** The selected list: its name and progress, the actions, then one row per slot the class fills. */
export default function BisListEditor({ list, listCount, itemList, gear, faction, dispatch }: BisListEditorProps) {
  const [renaming, setRenaming] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const slots = bisSlotsFor(list.classId);
  const { filled, obtained } = bisListProgress(list);
  const bracket = list.phase === BIS_LIST_PHASE.leveling ? "leveling" : "level60";

  function pick(slot: BisSlot, item: ClientItem) {
    const cleared = clashingSlots(slot.id).filter((s) => list.items[s] !== undefined);
    dispatch({ type: "setItem", id: list.id, slot: slot.id, itemId: item.id, now: Date.now() });
    setAnnouncement(`${item.name} is now your ${slot.label}`);
    if (cleared.length > 0) showSuccess(`Put ${item.name} in ${slot.label} and cleared ${bisSlotLabels(cleared)}`);
  }

  function clear(slot: BisSlot) {
    dispatch({ type: "setItem", id: list.id, slot: slot.id, itemId: null, now: Date.now() });
    setAnnouncement(`${slot.label} cleared`);
  }

  function toggleObtained(slot: BisSlot) {
    dispatch({ type: "toggleObtained", id: list.id, slot: slot.id, now: Date.now() });
  }

  function duplicate() {
    dispatch({ type: "duplicate", id: list.id, newId: newBisListId(), now: Date.now() });
    showSuccess(`Duplicated as “${duplicateBisListName(list.name)}”`);
  }

  function remove() {
    dispatch({ type: "delete", id: list.id });
    showSuccess(`Deleted “${list.name}”`);
  }

  return (
    <section aria-labelledby="bis-list-name" data-testid="bis-list-editor" className="rounded-xl border bg-card p-4 space-y-4 min-w-0">
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      {renaming ? (
        <BisListRenameForm
          name={list.name}
          onCancel={() => setRenaming(false)}
          onSave={(name) => {
            dispatch({ type: "rename", id: list.id, name, now: Date.now() });
            setRenaming(false);
            showSuccess(`Renamed to “${cleanBisListName(name, list.name)}”`);
          }}
        />
      ) : (
        <header className="space-y-1 min-w-0">
          <h2 id="bis-list-name" className="text-lg font-semibold break-words">
            {list.name}
          </h2>
          <p className="text-sm text-muted-foreground">
            {bisListSubtitle(list)} · <span data-testid="bis-list-progress">{obtained} of {filled} obtained</span>
          </p>
        </header>
      )}
      <BisListActions
        list={list}
        canDuplicate={listCount < MAX_BIS_LISTS}
        onRename={() => setRenaming(true)}
        onDuplicate={duplicate}
        onDelete={remove}
      />
      <ol className="divide-y">
        {slots.map((slot) => {
          const itemId = list.items[slot.id];
          return (
            <BisListEditableSlotRow
              key={slot.id}
              slot={slot}
              itemId={itemId}
              item={itemId === undefined ? undefined : itemList.byId.get(itemId)}
              source={itemId === undefined ? null : mainBisSource(gear, itemId, list.classId, faction)}
              classId={list.classId}
              bracket={bracket}
              itemList={itemList}
              obtained={list.obtained.includes(slot.id)}
              onPick={pick}
              onClear={clear}
              onToggleObtained={toggleObtained}
            />
          );
        })}
      </ol>
    </section>
  );
}
