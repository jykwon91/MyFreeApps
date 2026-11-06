import type { MergedStoryRedirect } from "@/games/wow-forever/types/featureRequests/mergedStoryRedirect";
import type { PublicStory } from "@/games/wow-forever/types/featureRequests/publicStory";

/** One story by id: the story itself, or where it was merged to. */
export type FeatureRequestLookup = PublicStory | MergedStoryRedirect;
