/** The `type`s the Gmail connect popup posts to the page that opened it. */
export const GMAIL_CONNECTED_MESSAGE = "gmail_connected";
export const GMAIL_CONNECT_FAILED_MESSAGE = "gmail_connect_failed";

/** What the popup says while it finishes, and once it has, if nothing opened it to tell. */
export const GMAIL_CONNECT_POPUP_COPY = {
  connecting: "Connecting… this window will close automatically.",
  connected: "Gmail's connected. You can close this window.",
} as const;

export const GMAIL_CONNECTED_TOAST = "Gmail's connected.";
