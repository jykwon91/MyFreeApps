/** What an add says when it fails. */
export interface CreateFailureCopy {
  /** When the server refused it, so nothing was saved and trying again is safe. */
  failed: string;
  /** Where the person can see whether it saved after all, read after "Check", like "your documents". */
  checkWhere: string;
  /** When the thing it was being added to has been deleted (a 404). Without it, a 404 says `failed`. */
  gone?: string;
}
