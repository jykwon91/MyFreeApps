import type { Integration } from "@mybookkeeper/api-client/types/integration/integration";
import type { GmailConnection } from "../../types/GmailConnection";

export function gmailIntegration(integrations: readonly Integration[] | undefined): Integration | undefined {
  return integrations?.find((integration) => integration.provider === "gmail");
}

/** The server lists Gmail only once it's linked, so absent means not connected. */
export function gmailConnection(gmail: Integration | undefined): GmailConnection {
  if (!gmail || gmail.connected === false) return "none";
  return gmail.needs_reauth ? "reauth" : "connected";
}
