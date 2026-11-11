/** One page of a paged list: the rows on it, and how many match across every page. */
export interface PageOfItems<T> {
  items: readonly T[];
  total: number;
}
