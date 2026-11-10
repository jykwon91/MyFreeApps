import type { LogEventFormValues } from "@myjobhunter/api-client/types/log-event-form-values";
import type { ChangeEventFormValue } from "./ChangeEventFormValue";
import type { EventFormErrors } from "./EventFormErrors";

export interface EventForm {
  values: LogEventFormValues;
  change: ChangeEventFormValue;
  /** Shown only once a save has been tried, so a fresh form isn't already red. */
  errors: EventFormErrors;
  /** Whether the interview fields show for the chosen event type. */
  hasInterviewFields: boolean;
  /** Marks a save as tried; true when nothing is wrong. */
  validate: () => boolean;
}
