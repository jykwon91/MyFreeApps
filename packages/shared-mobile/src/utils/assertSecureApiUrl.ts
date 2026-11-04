/** Tokens and passwords go to this address, so a real build must never use plain http. */
export function assertSecureApiUrl(url: string, isDevBuild: boolean = __DEV__): void {
  if (!isDevBuild && !url.startsWith("https://")) {
    throw new Error(`The API address must use https in a release build: ${url}`);
  }
}
