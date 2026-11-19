/** How a paged documents list refreshes itself: while documents are being read, a screen polls it. */
export interface DocumentPagesOptions {
  pollingInterval?: number;
  skip?: boolean;
}
