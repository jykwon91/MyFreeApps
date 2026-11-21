import { AlertBox } from "@platform/ui";
import type { RentReminderChannel } from "@mybookkeeper/api-client/types/rent/rent-reminder-channel";
import { possiblySentAdvice } from "./rent-reminder-possibly-sent";

export interface RentReminderPossiblySentWarningProps {
  /** Id of the warning text, for the Send button's `aria-describedby`. */
  id: string;
  channels: RentReminderChannel[];
  /** How the failed try went, e.g. "text" or "email and text". */
  channelWords: string;
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
  channelWords,
  confirmed,
  onConfirmedChange,
}: RentReminderPossiblySentWarningProps) {
  return (
    <AlertBox variant="warning" className="space-y-2" data-testid="rent-reminder-possibly-sent">
      <p id={id}>
        The last {channelWords} may already have reached the tenant. {possiblySentAdvice(channels)}
      </p>
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
