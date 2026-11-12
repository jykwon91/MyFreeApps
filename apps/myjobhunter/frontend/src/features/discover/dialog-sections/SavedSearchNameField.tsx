import type { ReactNode } from "react";
import { SAVED_SEARCH_NAME_MAX_LENGTH } from "@myjobhunter/api-client/constants/textFieldLimits";
import { characterCounter } from "@platform/core/utils/characterCounter";
import { FieldFeedback, fieldFeedbackAria } from "@platform/ui";

interface SavedSearchNameFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  /** Why the name can't be saved yet. The input never cuts a pasted name short, so this says so. */
  error: string | undefined;
  children?: ReactNode;
}

/** The optional name of a saved search, shared by the new and edit dialogs. */
export default function SavedSearchNameField({ id, value, onChange, error, children }: SavedSearchNameFieldProps) {
  const feedback = { id, error, counter: characterCounter(value.trim(), SAVED_SEARCH_NAME_MAX_LENGTH) };
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">
        Name{" "}
        <span className="text-muted-foreground font-normal">(optional)</span>
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. 'Stripe backend roles'"
        {...fieldFeedbackAria(feedback)}
        className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <FieldFeedback {...feedback} />
      {children}
    </div>
  );
}
