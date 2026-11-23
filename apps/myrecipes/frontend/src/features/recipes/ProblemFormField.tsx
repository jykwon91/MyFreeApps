import type { ReactNode } from "react";
import { FieldFeedback, FormField, fieldFeedbackAria, type FormFieldControlProps } from "@platform/ui";

interface Props {
  label: string;
  required?: boolean;
  highlight?: boolean;
  /** What's wrong with the field, shown under it and tied to the control. */
  error?: string;
  children: (field: FormFieldControlProps & ReturnType<typeof fieldFeedbackAria>) => ReactNode;
}

/** A labelled control that shows its problem inline, announced and marked invalid. */
export default function ProblemFormField({ label, required, highlight, error, children }: Props) {
  return (
    <FormField label={label} required={required} highlight={highlight}>
      {(field) => (
        <>
          {children({ ...field, ...fieldFeedbackAria({ id: field.id, error }) })}
          <FieldFeedback id={field.id} error={error} />
        </>
      )}
    </FormField>
  );
}
