import { REPLY_TAB } from "@/shared/lib/reply-tab";
import type { InquiryReplyMode } from "@/shared/types/inquiry/inquiry-reply-mode";
import type { ReplyReconnectReason } from "@/shared/types/inquiry/reply-reconnect-reason";
import type { ReplyTab } from "@/shared/types/inquiry/reply-tab";

interface UseInquiryReplyModeArgs {
  reconnectReason: ReplyReconnectReason;
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
  if (reconnectReason) return "reconnect";
  if (tab === REPLY_TAB.TEMPLATE) return "template";
  return "custom";
}
