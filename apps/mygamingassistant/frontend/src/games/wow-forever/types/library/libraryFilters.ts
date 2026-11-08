/** The book list's filters (kept in the URL). */
export interface LibraryFilters {
  query: string;
  /** Only books of this item level; null = every level. */
  itemLevel: number | null;
  hideFound: boolean;
}
