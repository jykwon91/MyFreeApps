const MONTH_YEAR: Intl.DateTimeFormatOptions = { year: "numeric", month: "short" };

/** "YYYY-MM-DD" as "Mar 2021", read as a calendar date so no time zone can move it a month. */
function formatMonthYear(isoDate: string): string {
  const [year, month] = isoDate.split("-");
  return new Date(Number(year), Number(month) - 1).toLocaleDateString("en-US", MONTH_YEAR);
}

/** A role's dates, such as "Mar 2021 – Present". */
export function formatWorkDateRange(start: string, end: string | null, isCurrent: boolean): string {
  if (isCurrent) return `${formatMonthYear(start)} – Present`;
  return end ? `${formatMonthYear(start)} – ${formatMonthYear(end)}` : `${formatMonthYear(start)} – No end date`;
}
