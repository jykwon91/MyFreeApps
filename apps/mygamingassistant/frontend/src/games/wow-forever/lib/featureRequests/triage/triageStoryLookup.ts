import type { TriageInbox } from "@/games/wow-forever/types/featureRequests/triage/triageInbox";
import type { TriageInboxItem } from "@/games/wow-forever/types/featureRequests/triage/triageInboxItem";
import type { TriageStory } from "@/games/wow-forever/types/featureRequests/triage/triageStory";
import type { TriageStoryList } from "@/games/wow-forever/types/featureRequests/triage/triageStoryList";

/**
 * The freshest copy of a story across the two cached reads — the one with the latest `updated_at`, so a
 * write's `If-Match` is never older than what the screen shows. Pure.
 */
export function findTriageStory(
  storyId: string,
  inbox: TriageInbox | undefined,
  stories: TriageStoryList | undefined,
): TriageStory | null {
  let best: TriageStory | null = null;
  const consider = (story: TriageStory | null | undefined) => {
    if (story === null || story === undefined || story.id !== storyId) return;
    if (best === null || story.updated_at > best.updated_at) best = story;
  };
  for (const item of inbox?.items ?? []) consider(item.story);
  for (const story of stories?.items ?? []) consider(story);
  return best;
}

/** The inbox submission with this id. */
export function findInboxItem(inbox: TriageInbox | undefined, submissionId: string | null): TriageInboxItem | null {
  if (submissionId === null) return null;
  return inbox?.items.find((i) => i.submission_id === submissionId) ?? null;
}

/** The `new` inbox submission whose story this is (Merge / Not planned from the inbox clear it too). */
export function findInboxItemForStory(inbox: TriageInbox | undefined, storyId: string): TriageInboxItem | null {
  return inbox?.items.find((i) => i.verdict === "new" && i.story?.id === storyId) ?? null;
}
