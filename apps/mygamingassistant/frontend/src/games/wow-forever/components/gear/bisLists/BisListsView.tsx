import { useState } from "react";
import { showSuccess } from "@platform/ui";
import LoadErrorRetry from "@/components/game/LoadErrorRetry";
import BisListCreateForm from "@/games/wow-forever/components/gear/bisLists/BisListCreateForm";
import BisListFactionToggle from "@/games/wow-forever/components/gear/bisLists/BisListFactionToggle";
import BisListEditor from "@/games/wow-forever/components/gear/bisLists/BisListEditor";
import BisListFootnote from "@/games/wow-forever/components/gear/bisLists/BisListFootnote";
import BisListPicker from "@/games/wow-forever/components/gear/bisLists/BisListPicker";
import BisListSkeleton from "@/games/wow-forever/components/gear/bisLists/BisListSkeleton";
import SharedBisListView from "@/games/wow-forever/components/gear/bisLists/SharedBisListView";
import { MAX_BIS_LISTS } from "@/games/wow-forever/data/bisLists/bisListConfig";
import { DEFAULT_BIS_LIST_PHASE } from "@/games/wow-forever/data/bisLists/bisListPhases";
import { BIS_LIST_START } from "@/games/wow-forever/data/bisLists/bisListStartOptions";
import { MAX_LEVEL } from "@/games/wow-forever/data/levelCap";
import { useBisLists } from "@/games/wow-forever/hooks/useBisLists";
import { listFromDraft } from "@/games/wow-forever/lib/bisLists/listFromDraft";
import { makeBisList, newBisListId } from "@/games/wow-forever/lib/bisLists/newBisList";
import type { BisListDraft } from "@/games/wow-forever/types/bisLists/bisListDraft";
import type { SharedBisList } from "@/games/wow-forever/types/bisLists/sharedBisList";
import type { SharedBisListLink } from "@/games/wow-forever/types/bisLists/sharedBisListLink";
import type { GearDataState } from "@/games/wow-forever/types/gearDataState";
import type { GearSettings } from "@/games/wow-forever/types/gearSettings";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

interface BisListsViewProps {
  settings: GearSettings;
  state: GearDataState;
  shared: SharedBisListLink;
  onFactionChange: (faction: PlayerFaction) => void;
}

function firstDraft(settings: GearSettings): BisListDraft {
  return {
    name: "",
    classId: settings.classId,
    specId: settings.specId,
    phase: DEFAULT_BIS_LIST_PHASE,
    start: BIS_LIST_START.recommended,
    level: settings.level ?? MAX_LEVEL,
  };
}

/** "My lists" on Best gear: your saved lists (this browser only), or a list someone shared by link. */
export default function BisListsView({ settings, state, shared, onFactionChange }: BisListsViewProps) {
  const [{ lists, selectedId }, dispatch] = useBisLists();
  const [creating, setCreating] = useState(false);

  if (state.status === "error") {
    return <LoadErrorRetry message="Couldn't load the item list. Check your connection and try again." onRetry={state.retry} retrying={state.retrying} />;
  }
  if (state.status === "loading") return <BisListSkeleton classId={settings.classId} />;

  const { list: itemList, gear } = state;
  const canAdd = lists.length < MAX_BIS_LISTS;
  const selected = lists.find((l) => l.id === selectedId) ?? null;

  function add(list: SharedBisList) {
    dispatch({ type: "create", list: makeBisList(list, newBisListId(), Date.now()) });
  }

  const factionToggle = <BisListFactionToggle faction={settings.faction} onChange={onFactionChange} />;

  if (shared.present) {
    return (
      <div className="space-y-4 min-w-0">
        {shared.list ? factionToggle : null}
        <SharedBisListView
          list={shared.list}
          itemList={itemList}
          gear={gear}
          faction={settings.faction}
          canSave={canAdd}
          onClose={shared.close}
          onSave={(list) => {
            add(list);
            showSuccess(`Saved “${list.name}” to your lists`);
            shared.close();
          }}
        />
      </div>
    );
  }

  const showForm = creating || lists.length === 0;
  return (
    <div className="space-y-4 min-w-0">
      {factionToggle}
      {lists.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Build your own best-in-slot list: pick an item for each slot, tick what you have, and share it by link.
        </p>
      ) : (
        <BisListPicker lists={lists} selectedId={selectedId} onSelect={(id) => dispatch({ type: "select", id })} onNew={() => setCreating(true)} />
      )}
      {showForm && canAdd ? (
        <BisListCreateForm
          initial={firstDraft(settings)}
          onCancel={lists.length > 0 ? () => setCreating(false) : undefined}
          onCreate={(draft) => {
            const list = listFromDraft(draft, settings.faction, itemList.items, gear);
            add(list);
            setCreating(false);
            showSuccess(`Created “${list.name}”`);
          }}
        />
      ) : null}
      {!showForm && selected ? (
        <BisListEditor list={selected} listCount={lists.length} itemList={itemList} gear={gear} faction={settings.faction} dispatch={dispatch} />
      ) : null}
      <BisListFootnote />
    </div>
  );
}
