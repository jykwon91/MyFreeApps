import type { NET_WORTH_LINE_SOURCES } from "../../constants/netWorth";

/** Where a net worth line comes from — and so which page edits it. */
export type NetWorthLineSource = (typeof NET_WORTH_LINE_SOURCES)[number];
