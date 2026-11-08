/** A site page Claude may point to ("the site has a page for it"), shown as a link under its answer. */
export interface AskSitePage {
  title: string;
  path: string;
  /** Words in Claude's answer that mean this page, lower case. */
  mentions: readonly string[];
}
