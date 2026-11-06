import type { FeatureRequestListArgs } from "@/games/wow-forever/types/featureRequests/featureRequestListArgs";
import type { PublicStory } from "@/games/wow-forever/types/featureRequests/publicStory";

/** The public board as `hooks/featureRequests/useFeatureBoard.ts` hands it to the page. */
export interface FeatureBoardState {
  /** The query the shown stories came from (the old filters while new ones load) — votes patch this cache entry. */
  listArgs: FeatureRequestListArgs;
  stories: PublicStory[];
  total: number;
  /** Stories the server says this browser voted for, across the loaded pages. */
  serverVotedIds: ReadonlySet<string>;
  /** Nothing to show yet (first load) — the skeleton. */
  isLoading: boolean;
  /** The first load failed — "Couldn't load the board." with Retry. */
  isError: boolean;
  /** The previous filters' list is still up while new ones load. */
  isStale: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
  refetch: () => void;
}
