import type { FeatureArea } from "@/games/wow-forever/types/featureRequests/featureArea";
import type { FeatureSort } from "@/games/wow-forever/types/featureRequests/featureSort";
import type { PublicStoryStatus } from "@/games/wow-forever/types/featureRequests/publicStoryStatus";

/** What the board asks for. An empty `statuses` means every public status. */
export interface FeatureRequestListArgs {
  statuses: readonly PublicStoryStatus[];
  area: FeatureArea | null;
  sort: FeatureSort;
  clientId: string;
}
