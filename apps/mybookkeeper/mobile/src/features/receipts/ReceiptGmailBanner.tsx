import type { ReceiptGmailState } from "@mybookkeeper/api-client/types/lease/receipt-gmail-state";
import { Banner } from "@platform/mobile";
import { WEB_BASE_URL } from "../../constants/api";
import { INTEGRATIONS_WEB_PATH, RECEIPTS_MESSAGES as MESSAGES } from "../../constants/receipts";
import { useOpenLink } from "../inquiries/useOpenLink";
import { gmailMessage } from "./receiptDisplay";

/** Gmail is connected on the website, so that's where this sends the host. */
export default function ReceiptGmailBanner({ state }: { state: ReceiptGmailState }) {
  const openLink = useOpenLink();
  const message = gmailMessage(state);
  if (!message) return null;
  return (
    <Banner
      actions={[{ label: MESSAGES.openWebsite, accessibilityHint: MESSAGES.opensBrowser, onPress: () => void openLink(`${WEB_BASE_URL}${INTEGRATIONS_WEB_PATH}`) }]}
      message={message}
    />
  );
}
