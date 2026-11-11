import { ROLE_SUGGESTIONS } from "../constants/discoverySuggestions";
import type { WorkHistory } from "../types/work-history/work-history";

/** The latest distinct job titles from work history, in its order. */
export function recentRoleSuggestions(items: readonly WorkHistory[] | undefined): string[] {
  const titles: string[] = [];
  for (const item of items ?? []) {
    const title = item.title?.trim();
    if (title && !titles.includes(title)) titles.push(title);
    if (titles.length >= ROLE_SUGGESTIONS) break;
  }
  return titles;
}
