import type { NET_WORTH_RANGES } from "../../constants/netWorth";

/** How far back the net worth chart reaches. */
export type NetWorthRange = (typeof NET_WORTH_RANGES)[number]["key"];
