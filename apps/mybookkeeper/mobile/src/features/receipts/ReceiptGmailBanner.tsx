import type { ReceiptGmailState } from "@mybookkeeper/api-client/types/lease/receipt-gmail-state";
import { Banner } from "@platform/mobile";
import { GMAIL_CONNECT_MESSAGES } from "../../constants/gmailConnect";
import { useConnectGmail } from "../integrations/useConnectGmail";
import { gmailMessage } from "./receiptDisplay";

/** Why receipts can't be emailed yet, with the button that connects Gmail. */
export default function ReceiptGmailBanner({ state }: { state: ReceiptGmailState }) {
  const connect = useConnectGmail();
  const message = gmailMessage(state);
  if (!message) return null;
  return (
    <Banner
      actions={[
        {
          label: state === "not_connected" ? GMAIL_CONNECT_MESSAGES.connect : GMAIL_CONNECT_MESSAGES.reconnect,
          accessibilityHint: GMAIL_CONNECT_MESSAGES.opensGoogle,
          onPress: () => connect.run(),
        },
      ]}
      message={message}
    />
  );
}
