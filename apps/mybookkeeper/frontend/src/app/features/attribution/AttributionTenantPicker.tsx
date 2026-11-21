import { UserCheck } from "lucide-react";
import { LoadingButton } from "@platform/ui";
import ListPagesErrorAlert from "@/shared/components/ui/ListPagesErrorAlert";
import PagedSelect from "@/shared/components/ui/PagedSelect";
import { useTenantSelectOptions } from "@/app/features/tenants/useTenantSelectOptions";

export interface AttributionTenantPickerProps {
  value: string;
  onChange: (applicantId: string) => void;
  /** Another action on the row is in flight. */
  disabled: boolean;
  isLinking: boolean;
  onLink: () => void;
}

/**
 * On an unmatched rent payment in the review queue: every tenant, a page at a time, to link it to. Mounted
 * only for those rows, so an Airbnb payout never loads the tenant list. When there are no tenants yet it says
 * where to add one, rather than leaving only "Not them".
 */
export default function AttributionTenantPicker({ value, onChange, disabled, isLinking, onLink }: AttributionTenantPickerProps) {
  const { pages, mode, options } = useTenantSelectOptions(null);

  if (mode === "error") {
    return (
      <div className="pt-1">
        <ListPagesErrorAlert pages={pages} noun="tenants" />
      </div>
    );
  }

  const linkButton = (
    <LoadingButton
      variant="primary"
      size="sm"
      isLoading={isLinking}
      loadingText="Linking..."
      onClick={onLink}
      disabled={mode !== "list" || !value || disabled}
    >
      <UserCheck className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
      Link
    </LoadingButton>
  );

  if (mode === "loading") {
    return (
      <div className="flex items-center gap-2 flex-wrap pt-1">
        <div
          className="border rounded px-2 py-1.5 text-sm bg-background min-h-[36px] max-w-[220px] flex items-center text-muted-foreground"
          role="status"
        >
          Loading tenants…
        </div>
        {linkButton}
      </div>
    );
  }

  if (mode === "empty") {
    return (
      <div className="flex items-center gap-2 flex-wrap pt-1">
        <p className="text-sm text-muted-foreground">
          No tenants with a signed lease yet — add one in Applicants.
        </p>
        {linkButton}
      </div>
    );
  }

  return (
    <div className="pt-1">
      <PagedSelect
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border rounded px-2 py-1.5 text-sm bg-background min-h-[36px] max-w-[220px]"
        aria-label="Pick a tenant for this payment"
        disabled={disabled}
        emptyLabel="— pick a tenant —"
        noun="tenants"
        options={options}
        pages={pages}
        aside={linkButton}
      />
    </div>
  );
}
