export interface UploadDocumentArgs {
  // The caller builds the form: a browser appends a File, a phone a { uri, name, type }.
  form: FormData;
  /** The workspace to file it in. Left out, it goes to the one active when it's sent. */
  workspaceId?: string;
}
