import type { DestinationViewer } from "../types/DestinationViewer";
import type { MoreMenuGroup } from "../types/MoreMenuGroup";
import type { MoreMenuItem } from "../types/MoreMenuItem";
import type { SearchDestination } from "../types/SearchDestination";
import { searchJoined, searchWords } from "./normalizeSearchText";

/** Whether this person is allowed to see the item. */
export function canSee(item: MoreMenuItem, viewer: DestinationViewer): boolean {
  if (item.access === "admin") return viewer.isAdmin;
  if (item.access === "write") return viewer.canWrite;
  return true;
}

/** The groups with the items this person can't see taken out, and no group left empty. */
export function visibleGroups(groups: readonly MoreMenuGroup[], viewer: DestinationViewer): MoreMenuGroup[] {
  return groups
    .map((group) => ({ ...group, items: group.items.filter((item) => canSee(item, viewer)) }))
    .filter((group) => group.items.length > 0);
}

/** Every item this person can see as one flat list, with the group each is under. */
export function flattenDestinations(groups: readonly MoreMenuGroup[], viewer: DestinationViewer): SearchDestination[] {
  return visibleGroups(groups, viewer).flatMap((group) => group.items.map((item) => ({ item, groupTitle: group.title })));
}

const startsSomeWord = (words: readonly string[], tokens: readonly string[]): boolean =>
  tokens.every((token) => words.some((word) => word.startsWith(token)));

/**
 * 3: every word typed starts a word of the label, in any order.
 * 2: what was typed is somewhere inside the label.
 * 1: a keyword matches the same way.
 * 0: no match.
 */
function matchRank(item: MoreMenuItem, tokens: readonly string[], joinedQuery: string): number {
  const labelWords = searchWords(item.label);
  if (startsSomeWord(labelWords, tokens)) return 3;
  if (searchJoined(item.label).includes(joinedQuery)) return 2;
  const keywords = item.keywords ?? [];
  if (keywords.some((keyword) => searchJoined(keyword).includes(joinedQuery))) return 1;
  return startsSomeWord([...labelWords, ...keywords.flatMap(searchWords)], tokens) ? 1 : 0;
}

/**
 * The destinations that match what was typed, best first and otherwise in menu order. A
 * query with no letters or digits matches nothing; the caller shows the grouped menu.
 */
export function filterDestinations(destinations: readonly SearchDestination[], query: string): SearchDestination[] {
  const tokens = searchWords(query);
  if (tokens.length === 0) return [];
  const joinedQuery = tokens.join("");
  return destinations
    .map((destination, index) => ({ destination, index, rank: matchRank(destination.item, tokens, joinedQuery) }))
    .filter(({ rank }) => rank > 0)
    .sort((a, b) => b.rank - a.rank || a.index - b.index)
    .map(({ destination }) => destination);
}
