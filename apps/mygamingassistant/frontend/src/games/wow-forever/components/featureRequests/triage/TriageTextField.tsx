import { useId } from "react";
import clsx from "clsx";
import { TRIAGE_COPY } from "@/games/wow-forever/data/featureRequests/triage/triageCopy";
import { TRIAGE_CHIP, TRIAGE_INPUT } from "@/games/wow-forever/data/featureRequests/triage/triageStyles";
import { counterLabel } from "@/games/wow-forever/lib/featureRequests/triage/triageFormat";

interface TriageTextFieldProps {
  label: string;
  /** Players see this field on the board (Public) or only the operator does (Private). */
  visibility: "public" | "private";
  value: string;
  onChange: (value: string) => void;
  max: number;
  multiline?: boolean;
  /** Shown under the field (e.g. the server's "No links or @names here"). */
  error?: string | null;
  hint?: string;
}

/** A labelled text field tagged Public / Private, with a counter once it's nearly full. */
export default function TriageTextField({ label, visibility, value, onChange, max, multiline = false, error = null, hint }: TriageTextFieldProps) {
  const id = useId();
  const counter = counterLabel(value.length, max);
  const describedBy = [hint !== undefined ? `${id}-hint` : null, error !== null ? `${id}-error` : null].filter(Boolean).join(" ");
  const common = {
    id,
    value,
    maxLength: max,
    "aria-invalid": error !== null,
    "aria-describedby": describedBy === "" ? undefined : describedBy,
    className: TRIAGE_INPUT,
  };
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        <span className={clsx(TRIAGE_CHIP, "font-normal", visibility === "public" ? "text-sky-800 dark:text-sky-200" : "text-muted-foreground")}>
          {visibility === "public" ? TRIAGE_COPY.public : TRIAGE_COPY.private}
        </span>
      </div>
      {hint !== undefined ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {multiline ? (
        <textarea {...common} rows={3} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input {...common} onChange={(e) => onChange(e.target.value)} />
      )}
      {counter !== null ? <p className="text-right text-xs text-muted-foreground">{counter}</p> : null}
      {error !== null ? (
        <p id={`${id}-error`} className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
