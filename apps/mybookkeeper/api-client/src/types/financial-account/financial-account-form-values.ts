/**
 * The add/edit account form's state, every field a string as typed.
 *
 * The balance is held in dollars and converted to cents on submit, so a
 * half-typed "12." never has to be a number.
 */
export interface FinancialAccountFormValues {
  name: string;
  /** ``""`` until the person picks, so the form cannot submit an assumption. */
  accountType: string;
  institutionName: string;
  mask: string;
  balanceDollars: string;
  balanceAsOf: string;
  mortgageId: string;
}
