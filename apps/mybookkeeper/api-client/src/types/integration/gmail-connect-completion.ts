/** Google's code and the signed state, handed back to the server to finish connecting Gmail. */
export interface GmailConnectCompletion {
  code: string;
  state: string;
}
