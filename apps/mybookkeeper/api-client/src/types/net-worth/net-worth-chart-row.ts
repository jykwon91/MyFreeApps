/** One day on the net worth chart, in dollars, labelled for the axis. */
export interface NetWorthChartRow {
  day: string;
  label: string;
  net: number;
  assets: number;
  liabilities: number;
}
