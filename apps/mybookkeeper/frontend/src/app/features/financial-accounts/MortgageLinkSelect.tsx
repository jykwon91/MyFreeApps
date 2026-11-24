import { LoadingRegion } from "@platform/ui";
import type { FormFieldControlProps } from "@platform/ui";
import { useMortgagesPages } from "@mybookkeeper/api-client/hooks/useMortgagesPages";
import { FINANCIAL_ACCOUNT_MESSAGES as MSG } from "@/shared/lib/financial-account-messages";
import { FINANCIAL_ACCOUNT_INPUT_CLASS } from "./financial-account-input-class";

export interface MortgageLinkSelectProps {
  value: string;
  onChange: (value: string) => void;
  field: FormFieldControlProps;
}

/** Mounted only for a mortgage account, so the mortgages are fetched only when the choice exists. */
export default function MortgageLinkSelect({ value, onChange, field }: MortgageLinkSelectProps) {
  const pages = useMortgagesPages();
  if (pages.isLoading) {
    return <LoadingRegion label={MSG.mortgagesLoading} className="h-11 w-full bg-muted/40 rounded-md animate-pulse" />;
  }
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={FINANCIAL_ACCOUNT_INPUT_CLASS}
      data-testid="financial-account-mortgage-select"
      {...field}
    >
      <option value="">{MSG.mortgageNone}</option>
      {pages.mortgages.map((mortgage) => (
        <option key={mortgage.id} value={mortgage.id}>
          {[mortgage.property_name, mortgage.lender].filter(Boolean).join(" — ") || mortgage.id}
        </option>
      ))}
    </select>
  );
}
