import { MERGE_TARGET_STATUSES } from "@/games/wow-forever/data/featureRequests/triage/triageEnums";
import {
  MERGE_SAME_AREA_BOOST,
  MERGE_SUGGESTION_COUNT,
  MERGE_SUGGESTION_MIN_SCORE,
} from "@/games/wow-forever/data/featureRequests/triage/triageConfig";
import type { MergeCandidate } from "@/games/wow-forever/types/featureRequests/triage/mergeCandidate";
import type { TriageStory } from "@/games/wow-forever/types/featureRequests/triage/triageStory";

const MIN_WORD_LENGTH = 3;
const STOP_WORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "into", "can", "could", "would", "should", "want",
  "wants", "show", "shows", "see", "page", "list", "lets", "let", "know", "what", "where", "which", "when",
  "how", "who", "are", "was", "were", "you", "your", "they", "them", "their", "its", "all", "any", "one",
  "add", "make", "more", "much", "some", "than", "then", "there", "have", "has", "had", "not", "but", "use",
]);

/** Lower-case content words of the story's title and "I want", with a trailing plural "s" dropped. */
function storyWords(story: Pick<TriageStory, "title" | "i_want">): Set<string> {
  const words = `${story.title} ${story.i_want}`.toLowerCase().split(/[^\p{L}\p{N}]+/u);
  const out = new Set<string>();
  for (const raw of words) {
    if (raw.length < MIN_WORD_LENGTH || STOP_WORDS.has(raw)) continue;
    out.add(raw.length > MIN_WORD_LENGTH + 1 && raw.endsWith("s") ? raw.slice(0, -1) : raw);
  }
  return out;
}

function overlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared += 1;
  return shared / (a.size + b.size - shared);
}

const TARGET_STATUSES: ReadonlySet<string> = new Set(MERGE_TARGET_STATUSES);

/** Stories `source` may be merged into: public statuses only, never itself, a merged or a hidden story. */
export function mergeTargets(source: Pick<TriageStory, "id">, stories: readonly TriageStory[]): TriageStory[] {
  return stories.filter((s) => s.id !== source.id && !s.hidden && TARGET_STATUSES.has(s.status));
}

/**
 * "Maybe the same as…": the targets sharing the most words with `source` (title + I want), same area
 * boosted, best first. Empty when nothing is a decent match. Pure.
 */
export function rankMergeCandidates(
  source: TriageStory,
  stories: readonly TriageStory[],
  limit: number = MERGE_SUGGESTION_COUNT,
): MergeCandidate[] {
  const words = storyWords(source);
  const ranked: MergeCandidate[] = [];
  for (const story of mergeTargets(source, stories)) {
    const base = overlap(words, storyWords(story));
    if (base === 0) continue;
    const score = base + (story.area === source.area ? MERGE_SAME_AREA_BOOST : 0);
    if (score >= MERGE_SUGGESTION_MIN_SCORE) ranked.push({ story, score });
  }
  ranked.sort((a, b) => b.score - a.score || b.story.vote_count - a.story.vote_count);
  return ranked.slice(0, limit);
}

/** Targets whose title or "I want" contains every word of `query` (case-insensitive). Empty query = all. */
export function searchMergeTargets(targets: readonly TriageStory[], query: string): TriageStory[] {
  const terms = query.toLowerCase().split(/\s+/).filter((t) => t !== "");
  if (terms.length === 0) return [...targets];
  return targets.filter((s) => {
    const haystack = `${s.title} ${s.i_want}`.toLowerCase();
    return terms.every((t) => haystack.includes(t));
  });
}
