import { useEffect } from "react";
import { skipToken } from "@reduxjs/toolkit/query/react";
import { useGetFeatureRequestQuery } from "@/games/wow-forever/api/wowFeatureRequestsApi";
import { BOARD_SECTION_ID } from "@/games/wow-forever/data/featureRequests/featureRequestBoard";
import { isMergedRedirect } from "@/games/wow-forever/lib/featureRequests/featureRequestGuards";
import type { PublicStory } from "@/games/wow-forever/types/featureRequests/publicStory";

/**
 * The story a `?r=<id>` link points at ("View on board", a shared link). On the loaded board it's
 * scrolled to; otherwise it's fetched on its own and pinned above the list. A link to a merged story
 * follows to the one it was merged into. Returns the story to pin, or null.
 */
export function useHighlightedStory(
  highlight: string | null,
  stories: readonly PublicStory[],
  boardLoaded: boolean,
  onRedirect: (storyId: string) => void,
): PublicStory | null {
  const onBoard = highlight !== null && stories.some((s) => s.id === highlight);
  const lookupId = highlight !== null && boardLoaded && !onBoard ? highlight : null;
  const { currentData: lookup } = useGetFeatureRequestQuery(lookupId ?? skipToken);
  const redirectTo = lookup !== undefined && isMergedRedirect(lookup) ? lookup.merged_into_id : null;
  const pinned = lookupId !== null && lookup !== undefined && !isMergedRedirect(lookup) ? lookup : null;

  useEffect(() => {
    if (redirectTo !== null) onRedirect(redirectTo);
  }, [redirectTo, onRedirect]);

  const scrollTarget = onBoard || pinned !== null ? highlight : null;
  useEffect(() => {
    if (scrollTarget === null) return;
    // Scoped to the board: the submit result above may show the same story.
    document
      .querySelector(`#${BOARD_SECTION_ID} [data-story-id="${CSS.escape(scrollTarget)}"]`)?.scrollIntoView({ block: "start" });
  }, [scrollTarget]);

  return pinned;
}
