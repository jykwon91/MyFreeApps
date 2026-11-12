import type { MoreMenuGroup } from "./MoreMenuGroup";
import type { MoreMenuItem } from "./MoreMenuItem";

export interface MoreMenuGroupsProps<Item extends MoreMenuItem = MoreMenuItem> {
  groups: readonly MoreMenuGroup<Item>[];
  webBaseUrl: string;
}
