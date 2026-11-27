/** Where money in came from. The three add up to total income. */
export interface PersonalFinancesIncomeSplit {
  salary_cents: number;
  /** Rent less the rentals' costs other than mortgage and loan payments. */
  rental_net_cents: number;
  other_cents: number;
}
