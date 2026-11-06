/**
 * Where a reply's unspent request id, and whether an earlier copy may already
 * have gone out, wait between sends, so trying again after the screen closed
 * (or the page reloaded) still sends under the same id.
 */
export interface ReplyRequestIdStore {
  get: (key: string) => string | null;
  set: (key: string, id: string) => void;
  delete: (key: string) => void;
}
