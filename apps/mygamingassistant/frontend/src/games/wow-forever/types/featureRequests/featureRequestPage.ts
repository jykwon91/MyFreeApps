import type { PublicStory } from "@/games/wow-forever/types/featureRequests/publicStory";

/** One page of the public board. */
export interface FeatureRequestPage {
  items: PublicStory[];
  next_offset: number | null;
  total: number;
  /** Which of these stories this browser (its client id) has voted for. */
  voted_story_ids: string[];
}
