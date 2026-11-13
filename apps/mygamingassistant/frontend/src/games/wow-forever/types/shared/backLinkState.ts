/** Router state a page passes along so the next page's back arrow returns to where the visitor came from. */
export interface BackLinkState {
  /** An in-app path, query included. */
  backTo: string;
  backLabel: string;
}
