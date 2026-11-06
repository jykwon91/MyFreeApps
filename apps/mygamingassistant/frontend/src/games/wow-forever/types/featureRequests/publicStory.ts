import type { PublicStoryStatus } from "@/games/wow-forever/types/featureRequests/publicStoryStatus";
import type { StoryText } from "@/games/wow-forever/types/featureRequests/storyText";

/** A story on the public board (`GET /api/wow/feature-requests`). No priority, no raw text. */
export interface PublicStory extends StoryText {
  status: PublicStoryStatus;
  operator_note: string | null;
  /** Where the shipped feature lives, always under /wow-forever. */
  shipped_path: string | null;
  vote_count: number;
  created_at: string;
}
