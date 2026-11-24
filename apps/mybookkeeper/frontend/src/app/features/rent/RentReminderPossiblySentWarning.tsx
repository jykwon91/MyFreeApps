import { AlertBox } from "@platform/ui";
import type { RentReminderChannel } from "@mybookkeeper/api-client/types/rent/rent-reminder-channel";
import { possiblySentWarning } from "@mybookkeeper/api-client/utils/rentReminderPossiblySent";
import { TENANT_WORDS } from "./rent-reminder-possibly-sent";

export interface RentReminderPossiblySentWarningProps {
  /** Id of the warning text, for the Send button's `aria-describedby`. */
  id: string;
  /** How the tries that may have gone out were sent. */
  channels: RentReminderChannel[];
  confirmed: boolean;
  onConfirmedChange: (confirmed: boolean) => void;
}

/**
 * The last try failed in a way that may still have reached the tenant, so
 * Send now stays off until the operator says they checked.
 */
export default function RentReminderPossiblySentWarning({
  id,
  channels,
  confirmed,
  onConfirmedChange,
}: RentReminderPossiblySentWarningProps) {
  return (
    <AlertBox variant="warning" className="space-y-2" data-testid="rent-reminder-possibly-sent">
      <p id={id}>{possiblySentWarning(channels, TENANT_WORDS)}</p>
      <label className="flex items-start gap-2 min-h-[44px]">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => onConfirmedChange(e.target.checked)}
          className="mt-0.5"
          data-testid="rent-reminder-confirm-possibly-sent"
        />
        <span>I checked, and it didn&apos;t arrive. Send it again.</span>
      </label>
    </AlertBox>
  );
}
