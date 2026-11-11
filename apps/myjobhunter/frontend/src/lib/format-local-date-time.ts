/** An ISO timestamp as the reader's local date and time. */
export function formatLocalDateTime(iso: string): string {
  return new Date(iso).toLocaleString();
}
