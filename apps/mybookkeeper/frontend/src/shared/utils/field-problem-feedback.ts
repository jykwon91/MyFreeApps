import type { FieldFeedbackProps } from "@platform/ui";

/**
 * What one field's ``FieldFeedback`` and ``fieldFeedbackAria`` need, under a stable name: the message
 * gets the id ``<prefix>-<field>-error`` and the test id ``<prefix>-<field>-problem``.
 */
export function fieldProblemFeedback(prefix: string, field: string, message: string | undefined): FieldFeedbackProps {
  return { id: `${prefix}-${field}`, error: message, testId: `${prefix}-${field}-problem` };
}
