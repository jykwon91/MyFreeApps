export interface DocumentDeleteArgs {
  id: string;
  /** The application the document belongs to, so its detail (which may show the document's text) refreshes. */
  applicationId: string | null;
}
