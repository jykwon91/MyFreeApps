import Select from "@/shared/components/ui/Select";
import { RENT_INPUT_CLASS } from "./rent-input-class";
import { WEEKDAY_NAMES } from "./rent-reminder-labels";
import type { RentReminderFrequency } from "@/shared/types/rent/rent-reminder-frequency";

export interface RentReminderFrequencyChoiceProps {
  frequency: RentReminderFrequency;
  dueWeekday: number;
  onFrequencyChange: (frequency: RentReminderFrequency) => void;
  onWeekdayChange: (weekday: number) => void;
}

const OPTION_CLASS =
  "flex items-start gap-3 rounded-lg border p-3 min-h-[44px] cursor-pointer bg-card has-[:checked]:border-primary has-[:checked]:ring-1 has-[:checked]:ring-primary";

/**
 * How the tenant pays — the one choice that changes everything else.
 *
 * Shown as two side-by-side options rather than a dropdown so a host sees at a
 * glance that a monthly payer and a weekly payer are both first-class: monthly
 * reminds for the whole month's rent before the 1st; weekly splits the month
 * across the tenant's pay day.
 */
export default function RentReminderFrequencyChoice({
  frequency,
  dueWeekday,
  onFrequencyChange,
  onWeekdayChange,
}: RentReminderFrequencyChoiceProps) {
  return (
    <fieldset className="space-y-2">
      <legend className="block text-sm font-medium mb-1">Tenant pays</legend>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className={OPTION_CLASS} data-testid="rent-reminder-frequency-monthly">
          <input
            type="radio"
            name="rent-reminder-frequency"
            value="monthly"
            checked={frequency === "monthly"}
            onChange={() => onFrequencyChange("monthly")}
            className="mt-1"
          />
          <span>
            <span className="block text-sm font-medium">Monthly — due on the 1st</span>
            <span className="block text-xs text-muted-foreground">
              One reminder for the whole month&apos;s rent.
            </span>
          </span>
        </label>

        <label className={OPTION_CLASS} data-testid="rent-reminder-frequency-weekly">
          <input
            type="radio"
            name="rent-reminder-frequency"
            value="weekly"
            checked={frequency === "weekly"}
            onChange={() => onFrequencyChange("weekly")}
            className="mt-1"
          />
          <span>
            <span className="block text-sm font-medium">
              Weekly — due every {WEEKDAY_NAMES[dueWeekday]}
            </span>
            <span className="block text-xs text-muted-foreground">
              The month&apos;s rent split evenly across its{" "}
              {WEEKDAY_NAMES[dueWeekday]}s.
            </span>
          </span>
        </label>
      </div>

      {frequency === "weekly" ? (
        <div>
          <label htmlFor="rent-reminder-weekday" className="block text-sm font-medium mb-1">
            Rent is due every
          </label>
          <Select
            id="rent-reminder-weekday"
            value={String(dueWeekday)}
            onChange={(e) => onWeekdayChange(Number(e.target.value))}
            className={RENT_INPUT_CLASS}
            data-testid="rent-reminder-weekday"
          >
            {WEEKDAY_NAMES.map((name, index) => (
              <option key={name} value={index}>
                {name}
              </option>
            ))}
          </Select>
        </div>
      ) : null}
    </fieldset>
  );
}
