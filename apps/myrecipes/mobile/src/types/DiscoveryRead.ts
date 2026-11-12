import type { DiscoveredDetail } from "@myrecipes/api-client/types/recipe/discovery";

/**
 * How far opening one discovered recipe has got. A read in flight keeps its request id, as result
 * ids repeat across searches and accounts, so only that request's answer is taken.
 */
export type DiscoveryRead =
  | { status: "reading"; requestId: string; startedAt: number }
  | { status: "failed"; message: string }
  | { status: "read"; detail: DiscoveredDetail };
