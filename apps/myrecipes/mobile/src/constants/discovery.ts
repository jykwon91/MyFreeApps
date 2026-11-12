import type { DiscoverySourceType } from "@myrecipes/api-client/types/recipe/discovery";
import type { ChipTone } from "@platform/mobile";

export const DISCOVER_ROUTE = "/discover";
export const DISCOVERY_DETAIL_PATHNAME = "/discover/[id]";

/** The source chip's colour. The label from @myrecipes/api-client says it in words. */
export const DISCOVERY_SOURCE_TONES: Record<DiscoverySourceType, ChipTone> = {
  website: "info",
  youtube: "danger",
  reddit: "warning",
  blog: "accent",
  video: "danger",
  forum: "neutral",
};

export const DISCOVERY_CARD_IMAGE_ASPECT = 16 / 10;
export const DISCOVERY_DETAIL_IMAGE_ASPECT = 4 / 3;
/** About a screen's worth of cards, so results replace the skeleton without a jump. */
export const DISCOVERY_SKELETON_CARD_COUNT = 3;

export const DISCOVERY_SIGNED_OUT = {
  heading: "Sign in to discover recipes",
  body: "Discover searches recipe sites, food blogs, YouTube and Reddit for the versions of a dish worth cooking. It needs a MyRecipes account.",
} as const;

export const DISCOVERY_MISSING_RESULT = {
  heading: "This result isn't open anymore",
  body: "Search again from Discover to find it.",
} as const;

export const DISCOVERY_MESSAGES = {
  searchFailedElsewhere: "Your Discover search didn't finish. Open Discover to see why.",
} as const;

export const DISCOVERY_DETAIL_COPY = {
  noIngredients: "This page didn't list ingredients we could read — open the original to check.",
  noSteps: "No steps we could read — open the original.",
  tipsHeading: "Tips from the source",
  communityHeading: "What cooks report",
  sourcesHeading: "Read from",
  saveHint: "You'll check it over before it's added to your recipes.",
} as const;
