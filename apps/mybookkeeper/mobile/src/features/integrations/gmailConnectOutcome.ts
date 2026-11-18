import type { GmailConnectFailure } from "@mybookkeeper/api-client/types/integration/gmail-connect-failure";
import type { WebBrowserAuthSessionResult } from "expo-web-browser";
import {
  GMAIL_CONNECT_FAILURES,
  GMAIL_CONNECT_RESULT_CONNECTED,
  GMAIL_CONNECT_RESULT_ERROR,
  GMAIL_CONNECT_RETURN_URL,
} from "../../constants/gmailConnect";
import type { GmailConnectOutcome } from "../../types/GmailConnectOutcome";

function isFailure(reason: string | null): reason is GmailConnectFailure {
  return GMAIL_CONNECT_FAILURES.some((failure) => failure === reason);
}

/** Reads where the sign-in browser stopped. Closing it is not a failure; an address that isn't the app's return path is. */
export function gmailConnectOutcome(result: WebBrowserAuthSessionResult): GmailConnectOutcome {
  if (result.type !== "success") return { kind: "closed" };
  if (!result.url.startsWith(`${GMAIL_CONNECT_RETURN_URL}?`)) return { kind: "failed", reason: "failed" };
  const params = new URL(result.url).searchParams;
  const outcome = params.get("result");
  if (outcome === GMAIL_CONNECT_RESULT_CONNECTED) return { kind: "connected" };
  const reason = params.get("reason");
  return { kind: "failed", reason: outcome === GMAIL_CONNECT_RESULT_ERROR && isFailure(reason) ? reason : "failed" };
}
