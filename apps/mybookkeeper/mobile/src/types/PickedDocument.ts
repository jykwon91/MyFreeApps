export interface PickedDocument {
  uri: string;
  name: string;
  /** What the picker says it is. Some leave it out, or say octet-stream. */
  mimeType?: string;
  /** In bytes, when the picker knows. */
  size?: number;
}
