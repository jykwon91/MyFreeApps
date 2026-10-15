import { Button, LoadingButton } from "@platform/ui";
import { RENT_INPUT_CLASS } from "./rent-input-class";
import { MAX_SEND_DAYS_BEFORE, SEND_TIME_MAX, SEND_TIME_MIN } from "./rent-reminder-labels";
import RentReminderChannelFields from "./RentReminderChannelFields";
import RentReminderFrequencyChoice from "./RentReminderFrequencyChoice";
import { useRentReminderForm } from "./useRentReminderForm";
import type { RentReminderOverview } from "@/shared/types/rent/rent-reminder-overview";

export interface RentReminderFormProps {
  applicantId: string;
  overview: RentReminderOverview;
  onSaved: () => void;
  onCancel: () => void;
}

/** The reminder settings: how the tenant pays, when to remind, where, and what to say. */
export default function RentReminderForm({
  applicantId,
  overview,
  onSaved,
  onCancel,
}: RentReminderFormProps) {
  const existing = overview.plan;
  const form = useRentReminderForm({
    applicantId,
    existing,
    smsAvailable: overview.sms.available,
    onSaved,
  });

  return (
    <form
      onSubmit={(e) => void form.handleSubmit(e)}
      className="space-y-4"
      data-testid="rent-reminder-form"
    >
      <RentReminderFrequencyChoice
        frequency={form.frequency}
        dueWeekday={form.dueWeekday}
        onFrequencyChange={form.setFrequency}
        onWeekdayChange={form.setDueWeekday}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="rent-reminder-days" className="block text-sm font-medium mb-1">
            Days before it&apos;s due
          </label>
          <input
            id="rent-reminder-days"
            type="number"
            inputMode="numeric"
            min={0}
            max={MAX_SEND_DAYS_BEFORE[form.frequency]}
            step={1}
            value={form.sendDaysBefore}
            onChange={(e) => form.setSendDaysBefore(e.target.value)}
            className={RENT_INPUT_CLASS}
            data-testid="rent-reminder-days"
            required
          />
          <p className="text-xs text-muted-foreground mt-1">
            {form.daysValid
              ? "0 sends it the morning rent is due."
              : `Pick 0 to ${MAX_SEND_DAYS_BEFORE[form.frequency]} days.`}
          </p>
        </div>

        <div>
          <label htmlFor="rent-reminder-time" className="block text-sm font-medium mb-1">
            At (Central time)
          </label>
          <input
            id="rent-reminder-time"
            type="time"
            min={SEND_TIME_MIN}
            max={SEND_TIME_MAX}
            value={form.sendTime}
            onChange={(e) => form.setSendTime(e.target.value)}
            className={RENT_INPUT_CLASS}
            data-testid="rent-reminder-time"
            required
          />
          <p className="text-xs text-muted-foreground mt-1">
            {form.timeValid
              ? "Reminders only go out between 9am and 8pm."
              : "Choose a time between 9:00 AM and 7:59 PM."}
          </p>
        </div>
      </div>

      <RentReminderChannelFields
        emailEnabled={form.emailEnabled}
        smsEnabled={form.smsEnabled}
        onEmailChange={form.setEmailEnabled}
        onSmsChange={form.setSmsEnabled}
        overview={overview}
        hasChannel={form.hasChannel}
      />

      <div>
        <label
          htmlFor="rent-reminder-instructions"
          className="block text-sm font-medium mb-1"
        >
          How to pay
        </label>
        <textarea
          id="rent-reminder-instructions"
          value={form.paymentInstructions}
          onChange={(e) => form.setPaymentInstructions(e.target.value)}
          maxLength={500}
          rows={2}
          placeholder="Zelle to you@example.com"
          className={RENT_INPUT_CLASS}
          data-testid="rent-reminder-instructions"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Added to the end of the message as &ldquo;Pay via …&rdquo;.
        </p>
      </div>

      <div>
        <label htmlFor="rent-reminder-override" className="block text-sm font-medium mb-1">
          Fixed amount ($, optional)
        </label>
        <input
          id="rent-reminder-override"
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          value={form.amountOverride}
          onChange={(e) => form.setAmountOverride(e.target.value)}
          className={RENT_INPUT_CLASS}
          data-testid="rent-reminder-override"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Leave empty to quote the amount from the rent schedule.
        </p>
      </div>

      {existing ? (
        <label className="flex items-center gap-2 min-h-[44px] text-sm">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => form.setIsActive(e.target.checked)}
            data-testid="rent-reminder-active"
          />
          Reminders on
        </label>
      ) : null}

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <LoadingButton
          type="submit"
          isLoading={form.isSaving}
          loadingText="Saving..."
          disabled={!form.canSubmit || form.isSaving}
          data-testid="rent-reminder-save"
        >
          {existing ? "Save reminders" : "Turn on reminders"}
        </LoadingButton>
      </div>
    </form>
  );
}
