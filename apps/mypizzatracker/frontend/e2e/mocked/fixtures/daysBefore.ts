/** The ISO instant `days` whole days before `iso`. */
const DAY_MS = 24 * 60 * 60 * 1000;

export function daysBefore(iso: string, days: number): string {
  return new Date(new Date(iso).getTime() - days * DAY_MS).toISOString();
}
