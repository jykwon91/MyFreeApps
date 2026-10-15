import type { RentReminderOverview } from "@/shared/types/rent/rent-reminder-overview";

export interface RentReminderChannelFieldsProps {
  emailEnabled: boolean;
  smsEnabled: boolean;
  onEmailChange: (enabled: boolean) => void;
  onSmsChange: (enabled: boolean) => void;
  overview: RentReminderOverview;
  hasChannel: boolean;
}

const ROW_CLASS = "flex items-start gap-2 min-h-[44px] text-sm";

/**
 * Email and text toggles. Text is disabled — with the reason shown — when the
 * server has no httpSMS setup, rather than letting the host switch on a
 * channel that would only ever fail.
 */
export default function RentReminderChannelFields({
  emailEnabled,
  smsEnabled,
  onEmailChange,
  onSmsChange,
  overview,
  hasChannel,
}: RentReminderChannelFieldsProps) {
  const { sms } = overview;
  return (
    <fieldset className="space-y-1">
      <legend className="block text-sm font-medium mb-1">Send by</legend>

      <label className={ROW_CLASS}>
        <input
          type="checkbox"
          checked={emailEnabled}
          onChange={(e) => onEmailChange(e.target.checked)}
          className="mt-0.5"
          data-testid="rent-reminder-email"
        />
        <span>
          Email
          {overview.tenant_has_email ? null : (
            <span className="block text-xs text-muted-foreground">
              No email on this tenant&apos;s record yet.
            </span>
          )}
        </span>
      </label>

      <label className={ROW_CLASS}>
        <input
          type="checkbox"
          checked={smsEnabled}
          disabled={!sms.available}
          onChange={(e) => onSmsChange(e.target.checked)}
          className="mt-0.5"
          data-testid="rent-reminder-sms"
        />
        <span>
          Text message
          <span
            className="block text-xs text-muted-foreground"
            data-testid="rent-reminder-sms-status"
          >
            {sms.available
              ? `From your phone, ${sms.from_number ?? ""}${sms.encrypted ? " (encrypted)" : ""}.`
              : "Not set up on this server yet — texts need the httpSMS phone relay."}
          </span>
          {sms.available && !overview.tenant_has_phone ? (
            <span className="block text-xs text-muted-foreground">
              No phone number on this tenant&apos;s record yet.
            </span>
          ) : null}
        </span>
      </label>

      {hasChannel ? null : (
        <p className="text-xs text-destructive" role="alert">
          Turn on email or text so the reminder has somewhere to go.
        </p>
      )}
    </fieldset>
  );
}
