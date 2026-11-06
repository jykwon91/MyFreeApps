import type { FeatureStoryStatus } from "@/games/wow-forever/types/featureRequests/featureStoryStatus";
import type { StoryText } from "@/games/wow-forever/types/featureRequests/storyText";
import type { TriageSubmissionNote } from "@/games/wow-forever/types/featureRequests/triage/triageSubmissionNote";

/**
 * A story with every field, private ones included (triage API only — never the public `PublicStory`).
 * `updated_at` is the concurrency version: sent back verbatim as `If-Match` on PATCH and merge.
 */
export interface TriageStory extends StoryText {
  status: FeatureStoryStatus;
  priority: number | null;
  operator_note: string | null;
  shipped_path: string | null;
  shipped_at: string | null;
  merged_into_id: string | null;
  vote_count: number;
  hidden: boolean;
  created_at: string;
  updated_at: string;
  submissions: TriageSubmissionNote[];
}
