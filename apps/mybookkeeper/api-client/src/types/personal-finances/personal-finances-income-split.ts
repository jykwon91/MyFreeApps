/** Where money in came from. Salary, rent, one-offs and other add up to total income. */
export interface PersonalFinancesIncomeSplit {
  /** Pay from a payroll company or a W-2 employer. */
  salary_cents: number;
  /** Rent and other rental money in, before the rentals' costs. */
  rental_cents: number;
  /** The rentals' costs other than mortgage and loan payments (counted in expenses). */
  rental_costs_cents: number;
  /** Rent less those costs; below zero when the rentals cost more than they brought in. */
  rental_net_cents: number;
  one_off_cents: number;
  other_cents: number;
}
