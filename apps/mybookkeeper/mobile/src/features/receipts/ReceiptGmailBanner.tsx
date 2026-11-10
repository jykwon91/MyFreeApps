import type { ReceiptGmailState } from "@mybookkeeper/api-client/types/lease/receipt-gmail-state";
import { Banner, useOpenWebsite } from "@platform/mobile";
import { WEB_BASE_URL } from "../../constants/api";
import { INTEGRATIONS_WEB_PATH } from "../../constants/integrations";
import { RECEIPTS_MESSAGES as MESSAGES } from "../../constants/receipts";
import { gmailMessage } from "./receiptDisplay";

/** Gmail is connected on the website, so that's where this sends the host. */
export default function ReceiptGmailBanner({ state }: { state: ReceiptGmailState }) {
  const openWebsite = useOpenWebsite();
  const message = gmailMessage(state);
  if (!message) return null;
  return (
    <Banner
      actions={[{ label: MESSAGES.openWebsite, accessibilityHint: MESSAGES.opensBrowser, onPress: () => void openWebsite(WEB_BASE_URL, INTEGRATIONS_WEB_PATH) }]}
      message={message}
    />
  );
}
