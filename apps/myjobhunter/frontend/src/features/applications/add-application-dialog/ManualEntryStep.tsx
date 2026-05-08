/**
 * ManualEntryStep — step-1 manual-company-name panel.
 *
 * The operator types a company name instead of pasting a URL or JD text.
 * The combobox handles both selecting an existing company and creating
 * a new one on the fly.
 */
import type { Company } from "@/types/company";
import CompanyCombobox from "../CompanyCombobox";

interface ManualEntryStepProps {
  companies: Company[];
  companyNameValue: string;
  onCompanyNameSelect: (companyId: string, name: string) => void;
  onCompanyNameCreate: (name: string) => void;
  onSwitchToUrl: () => void;
}

export default function ManualEntryStep({
  companies,
  companyNameValue,
  onCompanyNameSelect,
  onCompanyNameCreate,
  onSwitchToUrl,
}: ManualEntryStepProps) {
  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium">Company name</label>
      <CompanyCombobox
        companies={companies}
        initialValue={companyNameValue}
        onSelect={onCompanyNameSelect}
        onCreate={onCompanyNameCreate}
        onCancel={onSwitchToUrl}
      />
      <div className="pt-2 border-t">
        <button
          type="button"
          onClick={onSwitchToUrl}
          className="text-xs underline text-muted-foreground hover:text-foreground"
        >
          Have a URL? Paste it instead — we'll auto-fill from the page.
        </button>
      </div>
    </div>
  );
}
