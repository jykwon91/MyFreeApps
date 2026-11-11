/** "YYYY-MM-DD" as local midnight that day. `new Date("YYYY-MM-DD")` reads UTC, a day early west of it. */
export function isoDateToDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);
}
