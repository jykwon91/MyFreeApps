/** The words a "Showing X of Y" footer with a Load more button uses; each app supplies its own. */
export interface LoadMoreMessages {
  showingCount: (shown: number, total: number) => string;
  couldntLoadMore: string;
  loadingMore: string;
  tryAgain: string;
  loadMore: string;
}
