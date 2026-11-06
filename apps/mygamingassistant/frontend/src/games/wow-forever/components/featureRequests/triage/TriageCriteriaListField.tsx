import { useId } from "react";
import { Plus, Trash2 } from "lucide-react";
import { TRIAGE_COPY } from "@/games/wow-forever/data/featureRequests/triage/triageCopy";
import { TRIAGE_CHIP, TRIAGE_INPUT, TRIAGE_SECONDARY_BUTTON } from "@/games/wow-forever/data/featureRequests/triage/triageStyles";

interface TriageCriteriaListFieldProps {
  label: string;
  items: readonly string[];
  onChange: (items: string[]) => void;
  maxItems: number;
  maxLength: number;
  error?: string | null;
}

/** A short list of single-line items (acceptance criteria, follow-ups): add, edit, remove. Public. */
export default function TriageCriteriaListField({ label, items, onChange, maxItems, maxLength, error = null }: TriageCriteriaListFieldProps) {
  const id = useId();
  const set = (index: number, value: string) => onChange(items.map((item, i) => (i === index ? value : item)));
  return (
    <fieldset className="space-y-2">
      <legend className="flex items-center gap-2 text-sm font-medium">
        {label}
        <span className={`${TRIAGE_CHIP} font-normal text-sky-800 dark:text-sky-200`}>{TRIAGE_COPY.public}</span>
      </legend>
      <ul className="space-y-2">
        {items.map((item, index) => (
          <li key={index} className="flex gap-2">
            <input
              id={`${id}-${index}`}
              aria-label={`${label} ${index + 1}`}
              value={item}
              maxLength={maxLength}
              onChange={(e) => set(index, e.target.value)}
              className={TRIAGE_INPUT}
            />
            <button
              type="button"
              aria-label={`${TRIAGE_COPY.remove} ${label.toLowerCase()} ${index + 1}`}
              onClick={() => onChange(items.filter((_, i) => i !== index))}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border hover:bg-muted"
            >
              <Trash2 size={16} aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      {items.length < maxItems ? (
        <button type="button" onClick={() => onChange([...items, ""])} className={TRIAGE_SECONDARY_BUTTON}>
          <Plus size={16} aria-hidden />
          {TRIAGE_COPY.addCriterion}
        </button>
      ) : null}
      {error !== null ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
    </fieldset>
  );
}
