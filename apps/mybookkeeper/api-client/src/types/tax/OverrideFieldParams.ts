import type { TaxFieldOverrideValue } from "./TaxFieldOverrideValue";

export type OverrideFieldParams = {
  return_id: string;
  field_id: string;
  override_reason: string;
} & TaxFieldOverrideValue;
