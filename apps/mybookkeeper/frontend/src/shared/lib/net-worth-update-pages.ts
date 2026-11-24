import type { NetWorthLineSource } from "@mybookkeeper/api-client/types/net-worth/net-worth-line-source";

/** Where an out-of-date balance is updated. Properties are edited on the net worth page itself. */
export const NET_WORTH_UPDATE_PAGES: Record<Exclude<NetWorthLineSource, "property">, string> = {
  account: "/financial-accounts",
  mortgage: "/mortgages",
};
