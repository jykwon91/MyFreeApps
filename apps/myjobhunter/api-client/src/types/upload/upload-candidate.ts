/** What an upload check needs to know about a chosen file. An unknown size is left to the server. */
export interface UploadCandidate {
  mimeType: string;
  size?: number | null;
}
