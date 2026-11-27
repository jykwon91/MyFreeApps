/** The months asked for, "YYYY-MM"; null runs to that end of the bank history. */
export interface PersonalFinancesQuery {
  start: string | null;
  end: string | null;
}
