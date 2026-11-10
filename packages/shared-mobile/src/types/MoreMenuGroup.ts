import type { MoreMenuItem } from "./MoreMenuItem";

/** An app whose items carry more, such as who may see them, passes its own item type. */
export interface MoreMenuGroup<Item extends MoreMenuItem = MoreMenuItem> {
  title: string;
  items: readonly Item[];
}
