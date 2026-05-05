import type { GmailReconnectBannerProps } from "./GmailReconnectBanner";
import GmailReconnectBanner from "./GmailReconnectBanner";

export interface InquiryReplyReconnectBodyProps {
  reason: GmailReconnectBannerProps["reason"];
}

export default function InquiryReplyReconnectBody({
  reason,
}: InquiryReplyReconnectBodyProps) {
  return <GmailReconnectBanner reason={reason} />;
}
