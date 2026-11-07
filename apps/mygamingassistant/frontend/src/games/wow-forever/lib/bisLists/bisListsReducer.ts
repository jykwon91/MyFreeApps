import { MAX_BIS_LISTS } from "@/games/wow-forever/data/bisLists/bisListConfig";
import type { BisSlotId } from "@/games/wow-forever/data/bisLists/bisSlots";
import { cleanBisListName, duplicateBisListName } from "@/games/wow-forever/lib/bisLists/bisListName";
import { placeBisItem } from "@/games/wow-forever/lib/bisLists/placeBisItem";
import type { BisList } from "@/games/wow-forever/types/bisLists/bisList";
import type { BisListAction } from "@/games/wow-forever/types/bisLists/bisListAction";
import type { BisListsState } from "@/games/wow-forever/types/bisLists/bisListsState";

export const EMPTY_BIS_LISTS: BisListsState = { lists: [], selectedId: null };

function updateList(state: BisListsState, id: string, change: (list: BisList) => BisList): BisListsState {
  let changed = false;
  const lists = state.lists.map((list) => {
    if (list.id !== id) return list;
    const next = change(list);
    changed = next !== list;
    return next;
  });
  return changed ? { ...state, lists } : state;
}

/** After a delete, the list that took its place on screen: the next one, else the one before. */
function neighbourOf(lists: readonly BisList[], index: number): string | null {
  return (lists[index + 1] ?? lists[index - 1])?.id ?? null;
}

function withoutObtained(obtained: readonly BisSlotId[], slots: readonly BisSlotId[]): readonly BisSlotId[] {
  return obtained.filter((s) => !slots.includes(s));
}

/** The saved lists. Pure: ids and timestamps arrive in the action. */
export function bisListsReducer(state: BisListsState, action: BisListAction): BisListsState {
  switch (action.type) {
    case "load": {
      // This tab keeps the list it's showing while that list still exists.
      const { lists } = action.state;
      const keep = state.selectedId !== null && lists.some((l) => l.id === state.selectedId);
      return { lists, selectedId: keep ? state.selectedId : action.state.selectedId };
    }
    case "create": {
      if (state.lists.length >= MAX_BIS_LISTS || state.lists.some((l) => l.id === action.list.id)) return state;
      return { lists: [...state.lists, action.list], selectedId: action.list.id };
    }
    case "select":
      return state.lists.some((l) => l.id === action.id) ? { ...state, selectedId: action.id } : state;
    case "rename":
      return updateList(state, action.id, (list) => {
        const name = cleanBisListName(action.name, list.name);
        return name === list.name ? list : { ...list, name, updatedAt: action.now };
      });
    case "duplicate": {
      const index = state.lists.findIndex((l) => l.id === action.id);
      if (index < 0 || state.lists.length >= MAX_BIS_LISTS || state.lists.some((l) => l.id === action.newId)) return state;
      const source = state.lists[index];
      const copy: BisList = {
        ...source,
        id: action.newId,
        name: duplicateBisListName(source.name),
        updatedAt: action.now,
      };
      const lists = [...state.lists.slice(0, index + 1), copy, ...state.lists.slice(index + 1)];
      return { lists, selectedId: copy.id };
    }
    case "delete": {
      const index = state.lists.findIndex((l) => l.id === action.id);
      if (index < 0) return state;
      const selectedId = state.selectedId === action.id ? neighbourOf(state.lists, index) : state.selectedId;
      return { lists: state.lists.filter((l) => l.id !== action.id), selectedId };
    }
    case "setItem":
      return updateList(state, action.id, (list) => {
        if (list.items[action.slot] === (action.itemId ?? undefined)) return list;
        const { items, cleared } = placeBisItem(list.items, action.slot, action.itemId);
        // A new (or no) item in a row isn't one you have yet.
        const obtained = withoutObtained(list.obtained, [action.slot, ...cleared]);
        return { ...list, items, obtained, updatedAt: action.now };
      });
    case "toggleObtained":
      return updateList(state, action.id, (list) => {
        if (list.items[action.slot] === undefined) return list;
        const obtained = list.obtained.includes(action.slot)
          ? withoutObtained(list.obtained, [action.slot])
          : [...list.obtained, action.slot];
        return { ...list, obtained, updatedAt: action.now };
      });
  }
}
