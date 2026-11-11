/** What the download button says when it can't open a file. */
export const DOCUMENT_DOWNLOAD_MESSAGES = {
  failed: (reason: string) => `Couldn't download the file: ${reason}`,
  unsafeLink: "Couldn't download the file: the download link wasn't a web address.",
} as const;
