import { MAX_BIS_LISTS, UNNAMED_BIS_LIST } from "@/games/wow-forever/data/bisLists/bisListConfig";
import { DEFAULT_BIS_LIST_PHASE, isBisListPhase } from "@/games/wow-forever/data/bisLists/bisListPhases";
import { isBisSlotId, type BisSlotId } from "@/games/wow-forever/data/bisLists/bisSlots";
import { findClass, findSpec, firstSpec } from "@/games/wow-forever/data/classes";
import { cleanBisListName } from "@/games/wow-forever/lib/bisLists/bisListName";
import { parseBisListItems } from "@/games/wow-forever/lib/bisLists/parseBisListItems";
import { tidyBisListItems } from "@/games/wow-forever/lib/bisLists/tidyBisListItems";
import type { BisList } from "@/games/wow-forever/types/bisLists/bisList";
import type { BisListsState } from "@/games/wow-forever/types/bisLists/bisListsState";

const MAX_ID_LENGTH = 64;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseList(raw: unknown): BisList | null {
  if (!isRecord(raw) || typeof raw.id !== "string" || raw.id === "" || raw.id.length > MAX_ID_LENGTH) return null;
  const cls = typeof raw.classId === "string" ? findClass(raw.classId) : undefined;
  if (!cls) return null;
  const items = tidyBisListItems(isRecord(raw.items) ? parseBisListItems(Object.entries(raw.items)) : {}, cls.id);
  const obtained = Array.isArray(raw.obtained)
    ? [...new Set(raw.obtained.filter((s): s is BisSlotId => isBisSlotId(s) && items[s] !== undefined))]
    : [];
  return {
    id: raw.id,
    name: cleanBisListName(typeof raw.name === "string" ? raw.name : "", UNNAMED_BIS_LIST),
    classId: cls.id,
    specId: typeof raw.specId === "string" && findSpec(cls.id, raw.specId) ? raw.specId : firstSpec(cls.id),
    phase: isBisListPhase(raw.phase) ? raw.phase : DEFAULT_BIS_LIST_PHASE,
    items,
    obtained,
    updatedAt: typeof raw.updatedAt === "number" && Number.isFinite(raw.updatedAt) ? raw.updatedAt : 0,
  };
}

/** Saved lists from storage, list by list: a broken list is dropped, the rest survive. Null if it isn't our shape at all. */
export function parseStoredBisLists(raw: unknown): BisListsState | null {
  if (!isRecord(raw) || !Array.isArray(raw.lists)) return null;
  const lists: BisList[] = [];
  const seen = new Set<string>();
  for (const entry of raw.lists) {
    const list = parseList(entry);
    if (!list || seen.has(list.id)) continue;
    seen.add(list.id);
    lists.push(list);
    if (lists.length >= MAX_BIS_LISTS) break;
  }
  const selected = typeof raw.selectedId === "string" && seen.has(raw.selectedId) ? raw.selectedId : null;
  return { lists, selectedId: selected ?? lists[0]?.id ?? null };
}
