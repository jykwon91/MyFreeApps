/** "No writs match these filters", or, when a search is active, "No writs match “xyz”." */
export function professionEmptyMessage(noun: string, query: string): string {
  return query === "" ? `No ${noun} match these filters` : `No ${noun} match “${query}”.`;
}
