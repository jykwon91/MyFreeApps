/** What the extension keeps in chrome.storage.session once someone has signed in. */
export interface ExtensionSession {
  token?: string;
  email?: string;
  orgId?: string;
}
