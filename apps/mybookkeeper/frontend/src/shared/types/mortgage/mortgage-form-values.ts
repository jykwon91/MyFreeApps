/**
 * The mortgage form's state — every field a string, as typed.
 *
 * Money is held in dollars and converted to cents at submit, so a half-typed
 * "12." never has to be a number.
 */
export interface MortgageFormValues {
  lender: string;
  accountNumber: string;
  /** ``""`` until the operator picks, so the form cannot submit an assumption. */
  rateType: string;
  interestRate: string;
  fixedUntil: string;
  balanceDollars: string;
  statementDate: string;
  originalPrincipalDollars: string;
  maturityDate: string;
  termMonths: string;
  monthlyPrincipalDollars: string;
  monthlyInterestDollars: string;
  monthlyEscrowDollars: string;
  notes: string;
}
