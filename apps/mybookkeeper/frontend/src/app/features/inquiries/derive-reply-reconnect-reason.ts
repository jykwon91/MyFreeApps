import type { ReplyReconnectReason } from "@/shared/types/inquiry/reply-reconnect-reason";

/** While integrations load nothing is blocked; the reconnect banner waits until Gmail's state is known. */
export function deriveReplyReconnectReason(
  integrationsLoading: boolean,
  gmail: { needs_reauth?: boolean; has_send_scope?: boolean } | undefined,
): ReplyReconnectReason {
  if (integrationsLoading) return null;
  if (!gmail) return "missing-integration";
  if (gmail.needs_reauth) return "reauth-required";
  if (gmail.has_send_scope === false) return "missing-send-scope";
  return null;
}
