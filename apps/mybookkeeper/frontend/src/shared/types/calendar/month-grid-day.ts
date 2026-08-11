/** One day cell in the month grid. */
export interface MonthGridDay {
  /** ISO `YYYY-MM-DD`. */
  iso: string;
  /** Day-of-month number, pre-computed so the cell needn't re-parse. */
  dayOfMonth: number;
  /** False for the leading/trailing days borrowed from the adjacent months. */
  isInAnchorMonth: boolean;
  isToday: boolean;
}
