/** What usePageCountForFilter gives a list page. */
export interface PageCountForFilter {
  /** Pages to request for the current filter: 1 until "Load more" is used under it. */
  pageCount: number;
  /** Asks for one more page under the current filter. */
  loadMore: () => void;
}
