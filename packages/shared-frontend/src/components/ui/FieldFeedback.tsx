import type { FieldFeedbackProps } from "./FieldFeedbackProps";

/**
 * What sits under a text control: its error as an alert, and an optional character counter that is
 * not one. The counter is plain text (no role, no live region), so it is read when the control is
 * focused through `fieldFeedbackAria`, never on each keystroke. Spread `fieldFeedbackAria` onto the control.
 */
export default function FieldFeedback({ id, error, counter }: FieldFeedbackProps) {
  if (!error && !counter) return null;
  return (
    <div className="mt-1 flex items-start justify-between gap-2 text-xs">
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-destructive">
          {error}
        </p>
      ) : (
        <span />
      )}
      {counter ? (
        <span id={`${id}-counter`} className={error ? "text-destructive" : "text-muted-foreground"}>
          {counter}
        </span>
      ) : null}
    </div>
  );
}
