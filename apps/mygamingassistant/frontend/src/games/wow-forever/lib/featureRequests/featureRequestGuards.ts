import { BOARD_STATUS_FILTERS } from "@/games/wow-forever/data/featureRequests/featureRequestBoard";
import { FEATURE_AREAS, FEATURE_SORTS, VOTABLE_STORY_STATUSES } from "@/games/wow-forever/data/featureRequests/featureRequestEnums";
import type { BoardStatusFilter } from "@/games/wow-forever/types/featureRequests/boardStatusFilter";
import type { FeatureArea } from "@/games/wow-forever/types/featureRequests/featureArea";
import type { FeatureRequestLookup } from "@/games/wow-forever/types/featureRequests/featureRequestLookup";
import type { FeatureSort } from "@/games/wow-forever/types/featureRequests/featureSort";
import type { MergedStoryRedirect } from "@/games/wow-forever/types/featureRequests/mergedStoryRedirect";
import type { PublicStoryStatus } from "@/games/wow-forever/types/featureRequests/publicStoryStatus";

function oneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

export function isFeatureArea(value: unknown): value is FeatureArea {
  return oneOf(FEATURE_AREAS, value);
}

export function isFeatureSort(value: unknown): value is FeatureSort {
  return oneOf(FEATURE_SORTS, value);
}

export function isBoardStatusFilter(value: unknown): value is BoardStatusFilter {
  return oneOf(BOARD_STATUS_FILTERS, value);
}

/** Players can still say "Me too" (shipped and not-planned stories only show their count). */
export function isVotableStatus(status: PublicStoryStatus): boolean {
  return oneOf(VOTABLE_STORY_STATUSES, status);
}

export function isMergedRedirect(lookup: FeatureRequestLookup): lookup is MergedStoryRedirect {
  return "merged_into_id" in lookup;
}

/** A path inside this site ("/wow-forever/map") — never another origin or a `javascript:` URL. */
export function isSitePath(path: string): boolean {
  return path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\");
}
