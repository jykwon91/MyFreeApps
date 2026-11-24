import type { SecurityType } from "./security-type";

/** What the add/edit holding form holds while the person types. */
export interface HoldingFormValues {
  financialAccountId: string;
  ticker: string;
  name: string;
  securityType: SecurityType;
  quantity: string;
  price: string;
  /** Dollars as typed; empty when unknown. */
  costBasis: string;
}
