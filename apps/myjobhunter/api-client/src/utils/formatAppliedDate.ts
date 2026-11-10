/** The day an application went in, in the reader's locale. Null when it hasn't been sent. */
export function formatAppliedDate(appliedAt: string | null): string | null {
  return appliedAt ? new Date(appliedAt).toLocaleDateString() : null;
}
