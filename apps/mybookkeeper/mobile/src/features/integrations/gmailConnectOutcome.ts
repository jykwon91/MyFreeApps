import { readGmailConnectReturn } from "@mybookkeeper/api-client/utils/gmailConnectReturn";
import type { WebBrowserAuthSessionResult } from "expo-web-browser";
import { GMAIL_CONNECT_RETURN_URL } from "../../constants/gmailConnect";
import type { GmailConnectOutcome } from "../../types/GmailConnectOutcome";

/** Reads where the sign-in browser stopped. Closing it is not a failure; an address that isn't the app's return path is. */
export function gmailConnectOutcome(result: WebBrowserAuthSessionResult): GmailConnectOutcome {
  if (result.type !== "success") return { kind: "closed" };
  const prefix = `${GMAIL_CONNECT_RETURN_URL}#`;
  if (!result.url.startsWith(prefix)) return { kind: "failed", reason: "failed" };
  return readGmailConnectReturn(new URLSearchParams(result.url.slice(prefix.length)));
}
