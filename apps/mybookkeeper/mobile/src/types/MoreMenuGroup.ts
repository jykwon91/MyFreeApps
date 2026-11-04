import type { MoreMenuItem } from "./MoreMenuItem";

export interface MoreMenuGroup {
  title: string;
  items: readonly MoreMenuItem[];
}
