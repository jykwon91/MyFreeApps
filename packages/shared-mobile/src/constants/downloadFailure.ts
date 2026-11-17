/** What a failed download says when the phone can tell why; each caller supplies the wording for any other failure. */
export const DOWNLOAD_FAILURE_MESSAGES = {
  offline: "I couldn't reach the server. Check your connection and try again.",
  timeout: "That's taking too long. Check your connection and try again.",
  signedOut: "You've been signed out. Sign in again, then try once more.",
  notFound: "I couldn't find that file. It may have been removed.",
} as const;
