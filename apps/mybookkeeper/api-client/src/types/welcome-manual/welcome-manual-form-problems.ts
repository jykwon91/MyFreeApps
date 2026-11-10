/** Per-field validation messages; a missing key means the field is fine. */
export type WelcomeManualFormProblems<T> = Partial<Record<keyof T, string>>;
