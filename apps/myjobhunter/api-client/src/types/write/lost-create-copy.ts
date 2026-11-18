/** What an add says when it fails and what's on the server has been checked. */
export interface LostCreateCopy {
  /** When it's known nothing was saved, so trying again is safe. */
  failed: string;
  /** Where the person can see whether it saved after all, read after "Check", like "your companies". */
  checkWhere: string;
}
