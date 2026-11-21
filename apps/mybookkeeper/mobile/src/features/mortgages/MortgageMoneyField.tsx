import type { MortgageFormValues } from "@mybookkeeper/api-client/types/mortgage/mortgage-form-values";
import { FIELD_PRESETS, type FieldChain, FormField } from "@platform/mobile";

interface MortgageMoneyFieldProps {
  field: keyof MortgageFormValues;
  label: string;
  value: string;
  onChange: (field: keyof MortgageFormValues, value: string) => void;
  isBusy: boolean;
  error?: string;
  hint?: string;
  fields: FieldChain<keyof MortgageFormValues>;
}

export default function MortgageMoneyField({ field, label, value, onChange, isBusy, error, hint, fields }: MortgageMoneyFieldProps) {
  return <FormField {...FIELD_PRESETS.decimal} {...fields.field(field)} editable={!isBusy} error={error} hint={hint} label={label} onChangeText={(text) => onChange(field, text)} value={value} />;
}
