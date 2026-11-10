export interface FileForUpload {
  uri: string;
  name: string;
  mimeType: string;
  /** In bytes, when the picker said. */
  size?: number;
}
