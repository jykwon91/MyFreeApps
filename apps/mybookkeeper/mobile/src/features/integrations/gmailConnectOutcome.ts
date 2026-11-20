import { readGmailConnectReturn } from "@mybookkeeper/api-client/utils/gmailConnectReturn";
import type { WebBrowserAuthSessionResult } from "expo-web-browser";
import { GMAIL_CONNECT_RETURN_URL } from "../../constants/gmailConnect";
import type { GmailConnectOutcome } from "../../types/GmailConnectOutcome";

/** Reads where the sign-in browser stopped. Closing it is not a failure; an address that isn't the app's return path is. */
export function gmailConnectOutcome(result: WebBrowserAuthSessionResult): GmailConnectOutcome {
  if (result.type !== "success") return { kind: "closed" };
  if (!result.url.startsWith(`${GMAIL_CONNECT_RETURN_URL}?`)) return { kind: "failed", reason: "failed" };
  return readGmailConnectReturn(new URL(result.url).searchParams);
}
