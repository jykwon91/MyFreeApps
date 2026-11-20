/** A date edit that crossed into another year: which tax year the row is filed under now, and the date's year. */
export interface TaxYearQuestion {
  currentYear: number;
  newYear: number;
}
