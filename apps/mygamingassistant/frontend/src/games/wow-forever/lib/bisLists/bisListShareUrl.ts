import { BIS_LIST_PAGE_PATH } from "@/games/wow-forever/data/bisLists/bisListConfig";
import { encodeBisListFragment } from "@/games/wow-forever/lib/bisLists/bisListFragment";
import type { SharedBisList } from "@/games/wow-forever/types/bisLists/sharedBisList";

/** `https://…/wow-forever/gear?view=mine#list=1~…` — the list lives only in the fragment. */
export function bisListShareUrl(origin: string, list: SharedBisList): string {
  return `${origin}${BIS_LIST_PAGE_PATH}#${encodeBisListFragment(list)}`;
}

/** The shareable part of a saved list (no id, "I have it" ticks or timestamps). */
export function toSharedBisList(list: SharedBisList): SharedBisList {
  const { name, classId, specId, phase, items } = list;
  return { name, classId, specId, phase, items };
}
