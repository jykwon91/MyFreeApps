import { Button, LoadingButton } from "@platform/ui";
import Select from "@/shared/components/ui/Select";
import { RENT_INPUT_CLASS } from "./rent-input-class";
import { RENT_CADENCE_LABEL, RENT_START_HINT } from "./rent-labels";
import RentScheduleFixedTerms from "./RentScheduleFixedTerms";
import { useRentScheduleForm } from "./useRentScheduleForm";
import type { RentCadence } from "@/shared/types/rent/rent-cadence";
import type { RentSchedule } from "@/shared/types/rent/rent-schedule";

export interface RentScheduleFormProps {
  applicantId: string;
  existing: RentSchedule | null;
  onSaved: () => void;
  onCancel: () => void;
}

const CADENCES: readonly RentCadence[] = ["monthly", "weekly", "biweekly"];

/**
 * The rent-schedule fields.
 *
 * Amount and cadence are captured once, at creation, and shown as read-only
 * text thereafter. This is the form making a real constraint visible rather
 * than letting a host edit a number that would silently rewrite settled
 * history — a rent change is a new schedule, started the day it takes effect.
 */
export default function RentScheduleForm({
  applicantId,
  existing,
  onSaved,
  onCancel,
}: RentScheduleFormProps) {
  const form = useRentScheduleForm({ applicantId, existing, onSaved });

  return (
    <form onSubmit={(e) => void form.handleSubmit(e)} className="space-y-4">
      {existing ? (
        <RentScheduleFixedTerms schedule={existing} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="rent-schedule-amount"
              className="block text-sm font-medium mb-1"
            >
              Rent amount ($)
            </label>
            <input
              id="rent-schedule-amount"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={form.amount}
              onChange={(e) => form.setAmount(e.target.value)}
              className={RENT_INPUT_CLASS}
              data-testid="rent-schedule-amount"
              required
            />
            <p className="text-xs text-muted-foreground mt-1">
              What is owed per period — not what the tenant hands over each
              time.
            </p>
          </div>

          <div>
            <label
              htmlFor="rent-schedule-cadence"
              className="block text-sm font-medium mb-1"
            >
              Charged
            </label>
            <Select
              id="rent-schedule-cadence"
              value={form.cadence}
              onChange={(e) => form.setCadence(e.target.value as RentCadence)}
              className={RENT_INPUT_CLASS}
              data-testid="rent-schedule-cadence"
            >
              {CADENCES.map((option) => (
                <option key={option} value={option}>
                  {RENT_CADENCE_LABEL[option]}
                </option>
              ))}
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              How often rent comes due. Payments can arrive on any rhythm.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {existing ? null : (
          <div>
            <label
              htmlFor="rent-schedule-start"
              className="block text-sm font-medium mb-1"
            >
              First period starts
            </label>
            <input
              id="rent-schedule-start"
              type="date"
              value={form.startDate}
              onChange={(e) => form.setStartDate(e.target.value)}
              className={RENT_INPUT_CLASS}
              data-testid="rent-schedule-start"
              required
            />
            <p
              className="text-xs text-muted-foreground mt-1"
              data-testid="rent-schedule-start-hint"
            >
              {RENT_START_HINT[form.cadence]}
            </p>
          </div>
        )}

        <div>
          <label
            htmlFor="rent-schedule-end"
            className="block text-sm font-medium mb-1"
          >
            Last day (optional)
          </label>
          <input
            id="rent-schedule-end"
            type="date"
            value={form.endDate}
            min={existing?.start_date ?? form.startDate ?? undefined}
            onChange={(e) => form.setEndDate(e.target.value)}
            className={RENT_INPUT_CLASS}
            data-testid="rent-schedule-end"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Set this when the tenancy ends. A part-period is charged pro rata.
          </p>
        </div>
      </div>

      <div>
        <label
          htmlFor="rent-schedule-grace"
          className="block text-sm font-medium mb-1"
        >
          Late after (days into the period, optional)
        </label>
        <input
          id="rent-schedule-grace"
          type="number"
          inputMode="numeric"
          step="1"
          min="0"
          max="365"
          value={form.graceDays}
          onChange={(e) => form.setGraceDays(e.target.value)}
          className={RENT_INPUT_CLASS}
          data-testid="rent-schedule-grace"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Leave blank for a tenant paying in instalments — rent then counts as
          late only if the period ends short. Set 5 to flag anything still
          unpaid five days in.
        </p>
      </div>

      <div>
        <label
          htmlFor="rent-schedule-notes"
          className="block text-sm font-medium mb-1"
        >
          Notes
        </label>
        <textarea
          id="rent-schedule-notes"
          rows={2}
          value={form.notes}
          onChange={(e) => form.setNotes(e.target.value)}
          className={`${RENT_INPUT_CLASS} resize-none`}
          data-testid="rent-schedule-notes"
        />
      </div>

      {/* Removal sits apart from save: deleting the schedule retires every
          charge it generated, which is the right move for one entered by
          mistake and the wrong one for a tenancy that simply ended. */}
      <div className="flex items-center justify-between gap-3 pt-1">
        {existing ? (
          <LoadingButton
            type="button"
            variant="secondary"
            size="md"
            isLoading={form.isRemoving}
            loadingText="Removing..."
            onClick={() => void form.handleRemove()}
            data-testid="rent-schedule-remove-button"
          >
            Remove schedule
          </LoadingButton>
        ) : (
          <span />
        )}
        <div className="flex gap-3 justify-end">
          <Button type="button" variant="secondary" size="md" onClick={onCancel}>
            Cancel
          </Button>
          <LoadingButton
            type="submit"
            variant="primary"
            size="md"
            isLoading={form.isSaving}
            loadingText="Saving..."
            disabled={!form.canSubmit}
            data-testid="rent-schedule-save-button"
          >
            {existing ? "Update schedule" : "Set up rent"}
          </LoadingButton>
        </div>
      </div>
    </form>
  );
}
