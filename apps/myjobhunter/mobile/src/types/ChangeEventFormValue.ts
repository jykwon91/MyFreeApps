import type { LogEventFormValues } from "@myjobhunter/api-client/types/log-event-form-values";

/** Sets one field of a log-event or edit-interview form. */
export type ChangeEventFormValue = <Key extends keyof LogEventFormValues>(key: Key, value: LogEventFormValues[Key]) => void;
