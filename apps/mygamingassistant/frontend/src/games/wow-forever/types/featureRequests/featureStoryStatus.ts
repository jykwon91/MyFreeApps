import type { FEATURE_STORY_STATUSES } from "@/games/wow-forever/data/featureRequests/featureRequestEnums";

/** Every story status, private ones (`submitted`, `duplicate`) included. */
export type FeatureStoryStatus = (typeof FEATURE_STORY_STATUSES)[number];
