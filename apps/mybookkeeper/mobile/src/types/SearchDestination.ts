import type { MoreMenuItem } from "./MoreMenuItem";

/** One place the All screen can search for: the item, and the group it is listed under. */
export interface SearchDestination {
  item: MoreMenuItem;
  groupTitle: string;
}
