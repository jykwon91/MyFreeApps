/**
 * Inline "Attribute to tenant" widget shown in the TransactionPanel for
 * income transactions that are not yet linked to an applicant.
 *
 * Lists every lease_signed tenant from the dedicated /applicants/tenants
 * endpoint (the same source as the Tenants page), a page at a time with Load
 * more, in a native <select>, and fires the POST /transactions/{id}/attribute
 * endpoint on confirm.
 */
import { useState } from "react";
import { UserCheck } from "lucide-react";
import { LoadingButton, showError, showSuccess } from "@platform/ui";
import { useAttributeTransactionManuallyMutation } from "@mybookkeeper/api-client/store/attributionApi";
import { attributionSourceLabel } from "@mybookkeeper/api-client/constants/attributionLabels";
import ListPagesErrorAlert from "@/shared/components/ui/ListPagesErrorAlert";
import PagedSelect from "@/shared/components/ui/PagedSelect";
import { useTenantSelectOptions } from "@/app/features/tenants/useTenantSelectOptions";

export interface AttributeTenantPickerProps {
  transactionId: string;
  currentApplicantId: string | null;
  currentAttributionSource: "auto_exact" | "auto_fuzzy_confirmed" | "auto_alias" | "manual" | null;
}

export default function AttributeTenantPicker({
  transactionId,
  currentApplicantId,
  currentAttributionSource,
}: AttributeTenantPickerProps) {
  const [selectedId, setSelectedId] = useState<string>(currentApplicantId ?? "");
  const [attribute, { isLoading }] = useAttributeTransactionManuallyMutation();

  const { pages, mode, options: tenantOptions } = useTenantSelectOptions(currentApplicantId);

  const isAlreadyAttributed = Boolean(currentApplicantId);
  const hasChanged = selectedId !== (currentApplicantId ?? "");

  const handleAttribute = async () => {
    if (!selectedId) return;
    try {
      await attribute({ transaction_id: transactionId, applicant_id: selectedId }).unwrap();
      showSuccess("Payment linked to tenant.");
    } catch {
      showError("Couldn't link that payment. Try again?");
    }
  };

  if (mode === "loading") {
    return (
      <div className="h-8 w-48 animate-pulse rounded bg-muted" aria-busy="true" />
    );
  }

  if (mode === "error") return <ListPagesErrorAlert pages={pages} noun="tenants" />;

  if (tenantOptions.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic">
        No lease-signed tenants to link to.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <PagedSelect
        value={selectedId}
        onChange={(e) => setSelectedId(e.target.value)}
        className="border rounded px-2 py-1.5 text-sm bg-background min-h-[36px] max-w-[220px]"
        aria-label="Select tenant"
        emptyLabel="— select tenant —"
        noun="tenants"
        options={tenantOptions}
        pages={pages}
        aside={
          <LoadingButton
            variant="primary"
            size="sm"
            isLoading={isLoading}
            loadingText="Linking..."
            onClick={handleAttribute}
            disabled={!selectedId || !hasChanged}
          >
            <UserCheck className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
            {isAlreadyAttributed ? "Reassign" : "Link"}
          </LoadingButton>
        }
      />
      {isAlreadyAttributed && currentAttributionSource && (
        <p className="text-[11px] text-muted-foreground">
          Currently linked ({attributionSourceLabel(currentAttributionSource)})
        </p>
      )}
    </div>
  );
}
