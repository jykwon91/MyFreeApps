export interface TaxW2Row {
  id: string;
  employer: string;
  ein: string | null;
  wagesCents: number;
  federalWithheldCents: number;
  stateWithheldCents: number;
}
