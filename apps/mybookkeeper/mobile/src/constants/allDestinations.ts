import type { MoreMenuGroup } from "../types/MoreMenuGroup";
import { EXTRA_DESTINATIONS } from "./extraDestinations";
import { MORE_MENU } from "./moreMenu";
import { TAB_DESTINATIONS } from "./tabDestinations";

/** Everything the All screen can search, tabs first. */
export const ALL_DESTINATIONS: readonly MoreMenuGroup[] = [...TAB_DESTINATIONS, ...MORE_MENU, ...EXTRA_DESTINATIONS];
