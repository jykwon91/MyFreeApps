/** The canonical URL for a quest's detail page. */
export function questPageHref(questId: number): string {
  return `/wow-forever/quests/${questId}`;
}
