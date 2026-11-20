import { GMAIL_CONNECT_FAILURES, GMAIL_CONNECT_RESULT_ERROR } from "../constants/gmailConnect";
import type { GmailConnectFailure } from "../types/integration/gmail-connect-failure";
import type { GmailConnectReturn } from "../types/integration/gmail-connect-return";
import type { QueryParams } from "../types/integration/query-params";
import { errorDetail } from "./errorDetail";

/** A reason the server or the popup gave, if it's one the app knows. Anything else is a plain failure. */
export function toGmailConnectFailure(reason: unknown): GmailConnectFailure {
  return GMAIL_CONNECT_FAILURES.find((failure) => failure === reason) ?? "failed";
}

/** Reads Google's answer from the fragment the server forwarded it in. Anything it doesn't recognise is a plain failure. */
export function readGmailConnectReturn(params: QueryParams): GmailConnectReturn {
  const code = params.get("code");
  const state = params.get("state");
  if (code && state) return { kind: "authorized", code, state };
  return { kind: "failed", reason: params.get("result") === GMAIL_CONNECT_RESULT_ERROR ? toGmailConnectFailure(params.get("reason")) : "failed" };
}

/** Why the server refused to finish the connection, from its answer. Anything else, an outage included, is `failed`. */
export function gmailConnectRefusalReason(error: unknown): GmailConnectFailure {
  return toGmailConnectFailure(errorDetail(error));
}
