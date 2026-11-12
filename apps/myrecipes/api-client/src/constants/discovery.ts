import type {
  DiscoveryDifficulty,
  DiscoverySourceType,
} from "../types/recipe/discovery";

/**
 * Discovery copy and labels, shared by the website and the phone so a result reads the same on
 * both. Exhaustive `Record`s on purpose: add a source type to the backend `Literal` and
 * TypeScript fails here until its label exists, rather than showing a blank badge.
 */
export const DISCOVERY_SOURCE_LABELS: Record<DiscoverySourceType, string> = {
  website: "Recipe site",
  youtube: "YouTube",
  reddit: "Reddit",
  blog: "Blog",
  video: "Video",
  forum: "Forum",
};

export const DISCOVERY_DIFFICULTY_LABELS: Record<DiscoveryDifficulty, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Involved",
};

/** The backend's `DiscoveryQuery.query` bounds. */
export const DISCOVERY_QUERY_MIN_LENGTH = 2;
export const DISCOVERY_QUERY_MAX_LENGTH = 200;

/**
 * What a search or a read is doing, in order. Each takes tens of seconds, so the status line
 * moves on every `DISCOVERY_STAGE_SECONDS` to show the wait is progressing. They describe the
 * request's steps, not the server's actual progress, which nothing reports.
 */
export const DISCOVERY_SEARCH_STAGES = [
  "Searching the web for versions of this dish...",
  "Reading through what we found...",
  "Comparing the versions worth cooking...",
] as const;

export const DISCOVERY_READ_STAGES = [
  "Opening the recipe...",
  "Reading the ingredients and method...",
  "Pulling out the tips and what cooks report...",
] as const;

export const DISCOVERY_STAGE_SECONDS = 9;

export const DISCOVERY_INTRO =
  "Name a dish and we'll search recipe sites, food blogs, YouTube and Reddit for the versions worth cooking.";

export const DISCOVERY_QUERY_PLACEHOLDER = "What do you want to make?";

export const DISCOVERY_EMPTY_COPY = {
  heading: "Find the best version of a dish",
  body: "Search recipe sites, food blogs, YouTube and Reddit at once, compare what makes each version different, and save the one you want to cook.",
} as const;

/** Seed queries for an idle Discover, so it is never a dead end. */
export const DISCOVERY_SUGGESTIONS = [
  "Mexican flan",
  "Carbonara",
  "Chicken tikka masala",
  "Sourdough focaccia",
] as const;
