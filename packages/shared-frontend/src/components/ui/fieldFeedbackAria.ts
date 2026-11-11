import type { FieldFeedbackProps } from "./FieldFeedbackProps";

/** The attributes that tie a control to its `FieldFeedback`. */
export function fieldFeedbackAria({ id, error, counter }: FieldFeedbackProps): {
  "aria-invalid"?: true;
  "aria-describedby"?: string;
} {
  const described = [error ? `${id}-error` : null, counter ? `${id}-counter` : null].filter(Boolean).join(" ");
  return {
    ...(error ? { "aria-invalid": true as const } : {}),
    ...(described ? { "aria-describedby": described } : {}),
  };
}
