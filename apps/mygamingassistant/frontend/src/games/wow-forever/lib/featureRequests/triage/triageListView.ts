import type { TriageListFilters } from "@/games/wow-forever/types/featureRequests/triage/triageListFilters";
import type { TriageStatusFilter } from "@/games/wow-forever/types/featureRequests/triage/triageStatusFilter";
import type { TriageStory } from "@/games/wow-forever/types/featureRequests/triage/triageStory";

function matchesStatus(story: TriageStory, filter: TriageStatusFilter): boolean {
  if (filter === "merged") return story.status === "duplicate";
  if (filter === "hidden") return story.hidden && story.status !== "duplicate";
  return !story.hidden && story.status === filter;
}

function byNewest(a: TriageStory, b: TriageStory): number {
  return b.created_at.localeCompare(a.created_at);
}

/** No priority sorts last. */
function priorityRank(story: TriageStory): number {
  return story.priority ?? Number.MAX_SAFE_INTEGER;
}

/** The All requests list for these filters, sorted. Waiting-for-review stories live in the inbox. Pure. */
export function filterTriageStories(stories: readonly TriageStory[], filters: TriageListFilters): TriageStory[] {
  const shown = stories.filter(
    (s) => matchesStatus(s, filters.status) && (filters.area === null || s.area === filters.area),
  );
  if (filters.sort === "new") return shown.sort(byNewest);
  if (filters.sort === "priority") {
    return shown.sort((a, b) => priorityRank(a) - priorityRank(b) || b.vote_count - a.vote_count || byNewest(a, b));
  }
  return shown.sort((a, b) => b.vote_count - a.vote_count || byNewest(a, b));
}

/** How many stories were merged into each story id. */
export function mergedIntoCounts(stories: readonly TriageStory[]): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const s of stories) {
    if (s.merged_into_id !== null) counts.set(s.merged_into_id, (counts.get(s.merged_into_id) ?? 0) + 1);
  }
  return counts;
}
