/**
 * Sub-form rendered inside `LogEventDialog` (create) and `EventListItem`
 * (inline edit) when the event_type is interview-shaped.
 *
 * Only `type` is required; everything else is best-effort metadata that
 * gets serialised into the `interview_details` JSONB column at submit time.
 */
import type { UseFormRegister, FieldErrors } from "react-hook-form";
import type { InterviewType } from "@/types/interview-details";
import type { LogEventFormValues } from "./interviewEventForm";

const INTERVIEW_TYPE_OPTIONS: { value: InterviewType; label: string }[] = [
  { value: "phone", label: "Phone" },
  { value: "video", label: "Video" },
  { value: "onsite", label: "On-site" },
  { value: "panel", label: "Panel" },
];

interface Props {
  register: UseFormRegister<LogEventFormValues>;
  errors: FieldErrors<LogEventFormValues>;
  /**
   * When true, `scheduled_at` + `duration_minutes` stack vertically
   * instead of the 2-column grid. The inline edit affordance inside
   * EventListItem uses this — the panel is narrower than the create
   * modal and the datetime-local picker clips at 2-col.
   */
  stackedLayout?: boolean;
  /**
   * Optional prefix used to scope DOM ids so multiple instances of this
   * fieldset can coexist (e.g. one inline form per event card). Defaults
   * to "interview" which preserves the historic id values.
   */
  idPrefix?: string;
}

export default function InterviewDetailsFields({
  register,
  errors,
  stackedLayout = false,
  idPrefix = "interview",
}: Props) {
  const dateDurationLayout = stackedLayout
    ? "space-y-3"
    : "grid grid-cols-2 gap-3";
  return (
    <fieldset className="border rounded-md p-3 space-y-3">
      <legend className="px-1 text-xs font-medium text-muted-foreground">
        Interview details
      </legend>

      <div>
        <label htmlFor={`${idPrefix}-type`} className="block text-sm font-medium mb-1">
          Type <span className="text-destructive">*</span>
        </label>
        <select
          id={`${idPrefix}-type`}
          {...register("interview_type", {
            required: "Pick the interview type",
          })}
          className="w-full border rounded-md px-3 py-2 text-sm bg-background"
        >
          <option value="">Select…</option>
          {INTERVIEW_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {errors.interview_type ? (
          <p className="text-xs text-destructive mt-1">
            {errors.interview_type.message}
          </p>
        ) : null}
      </div>

      <div className={dateDurationLayout}>
        <div>
          <label htmlFor={`${idPrefix}-scheduled-at`} className="block text-sm font-medium mb-1">
            Scheduled at
          </label>
          <input
            id={`${idPrefix}-scheduled-at`}
            type="datetime-local"
            {...register("interview_scheduled_at")}
            className="w-full border rounded-md px-3 py-2 text-sm bg-background"
          />
        </div>
        <div>
          <label htmlFor={`${idPrefix}-duration`} className="block text-sm font-medium mb-1">
            Duration (min)
          </label>
          <input
            id={`${idPrefix}-duration`}
            type="number"
            min={1}
            max={1440}
            {...register("interview_duration_minutes", {
              valueAsNumber: false,
              validate: (v) => {
                if (v === "" || v == null) return true;
                const n = Number(v);
                if (!Number.isFinite(n) || n < 1 || n > 1440) {
                  return "Between 1 and 1440";
                }
                return true;
              },
            })}
            placeholder="e.g. 60"
            className="w-full border rounded-md px-3 py-2 text-sm bg-background"
          />
          {errors.interview_duration_minutes ? (
            <p className="text-xs text-destructive mt-1">
              {errors.interview_duration_minutes.message}
            </p>
          ) : null}
        </div>
      </div>

      <div>
        <label htmlFor={`${idPrefix}-location`} className="block text-sm font-medium mb-1">
          Location or link
        </label>
        <input
          id={`${idPrefix}-location`}
          type="text"
          {...register("interview_location_or_link", { maxLength: 1024 })}
          placeholder="https://meet.google.com/… or 123 Main St"
          className="w-full border rounded-md px-3 py-2 text-sm bg-background"
        />
      </div>

      <div>
        <label htmlFor={`${idPrefix}-interviewers`} className="block text-sm font-medium mb-1">
          Interviewer names
        </label>
        <textarea
          id={`${idPrefix}-interviewers`}
          {...register("interview_interviewer_names")}
          rows={2}
          placeholder="One per line"
          className="w-full border rounded-md px-3 py-2 text-sm bg-background"
        />
      </div>
    </fieldset>
  );
}
