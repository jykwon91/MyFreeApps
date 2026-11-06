import type { FeatureRequestListArgs } from "@/games/wow-forever/types/featureRequests/featureRequestListArgs";

/** Vote (`voted: true`) or take the vote back on a story shown by the board query `listArgs`. */
export interface VoteArgs {
  storyId: string;
  voted: boolean;
  clientId: string;
  listArgs: FeatureRequestListArgs;
}
