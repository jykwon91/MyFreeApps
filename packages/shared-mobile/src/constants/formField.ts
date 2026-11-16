/** Read once when a save turns up problems in more than one field, instead of one message per field. */
export const fieldErrorsSummary = (fieldNames: readonly string[]): string =>
  `${fieldNames.length} fields need attention: ${fieldNames.join(", ")}.`;
