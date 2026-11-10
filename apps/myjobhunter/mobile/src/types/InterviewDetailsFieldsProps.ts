import type { LogEventFormValues } from "@myjobhunter/api-client/types/log-event-form-values";
import type { ChangeEventFormValue } from "./ChangeEventFormValue";
import type { EventFormErrors } from "./EventFormErrors";

export interface InterviewDetailsFieldsProps {
  values: LogEventFormValues;
  onChange: ChangeEventFormValue;
  errors: EventFormErrors;
  disabled: boolean;
}
