/** Read once when a save turns up problems in more than one field, instead of one message per field. */
export const fieldErrorsSummary = (fieldNames: readonly string[]): string =>
  `${fieldNames.length} fields need attention: ${fieldNames.join(", ")}.`;

/** Spoken in a field's name before its error, so the problem is heard even when hints are turned off. */
export const FIELD_ERROR_NAME_PREFIX = "error: ";
