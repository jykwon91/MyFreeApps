import type { ClientItemList } from "@/games/wow-forever/types/clientItemList";
import type { GearData } from "@/games/wow-forever/types/gearData";

/** The Best gear page's data: the item list plus the gear sources/facts. */
export type GearDataState =
  | { status: "loading" }
  | { status: "error"; retry: () => void; retrying: boolean }
  | { status: "ready"; list: ClientItemList; gear: GearData };
