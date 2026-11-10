import type { MoreMenuGroup } from "@platform/mobile";
import type { MoreDestination } from "../types/MoreDestination";
import { EXTRA_DESTINATIONS } from "./extraDestinations";
import { MORE_MENU } from "./moreMenu";
import { TAB_DESTINATIONS } from "./tabDestinations";

/** Everything the All screen can search, tabs first. */
export const ALL_DESTINATIONS: readonly MoreMenuGroup<MoreDestination>[] = [...TAB_DESTINATIONS, ...MORE_MENU, ...EXTRA_DESTINATIONS];
