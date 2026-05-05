import type { InquiryReplyMode } from "@/shared/types/inquiry/inquiry-reply-mode";

type ReconnectReason =
  | "missing-integration"
  | "missing-send-scope"
  | "reauth-required"
  | null;

type ReplyTab = "template" | "custom";

interface UseInquiryReplyModeArgs {
  reconnectReason: ReconnectReason;
  tab: ReplyTab;
}

/**
 * Resolves the reply panel body's render mode. Single source of truth so the
 * body component is a flat switch instead of a tower of conditionals.
 *
 * While integrations load, the caller passes reconnectReason=null so the
 * normal tab flow renders — the reconnect banner only appears once Gmail
 * status is known to be broken.
 */
export function useInquiryReplyMode({
  reconnectReason,
  tab,
}: UseInquiryReplyModeArgs): InquiryReplyMode {
  if (reconnectReason !== null) return "reconnect";
  if (tab === "template") return "template";
  return "custom";
}
