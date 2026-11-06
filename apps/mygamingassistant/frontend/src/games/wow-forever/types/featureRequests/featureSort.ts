import type { FEATURE_SORTS } from "@/games/wow-forever/data/featureRequests/featureRequestEnums";

/** Board order: most asked-for first, or newest first. */
export type FeatureSort = (typeof FEATURE_SORTS)[number];
