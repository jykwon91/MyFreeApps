/**
 * Inline "Attribute to tenant" widget shown in the TransactionPanel for
 * income transactions that are not yet linked to an applicant.
 *
 * Fetches lease_signed applicants, shows a native <select>, and fires the
 * POST /transactions/{id}/attribute endpoint on confirm.
 */
import { useState } from "react";
import { UserCheck } from "lucide-react";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import { useGetApplicantsQuery } from "@/shared/store/applicantsApi";
import { useAttributeTransactionManuallyMutation } from "@/shared/store/attributionApi";
import { showError, showSuccess } from "@/shared/lib/toast-store";

export interface AttributeTenantPickerProps {
  transactionId: string;
  currentApplicantId: string | null;
  currentAttributionSource: "auto_exact" | "auto_fuzzy_confirmed" | "manual" | null;
}

export default function AttributeTenantPicker({
  transactionId,
  currentApplicantId,
  currentAttributionSource,
}: AttributeTenantPickerProps) {
  const [selectedId, setSelectedId] = useState<string>(currentApplicantId ?? "");
  const [attribute, { isLoading }] = useAttributeTransactionManuallyMutation();

  const { data: applicantsResponse, isLoading: loadingApplicants } = useGetApplicantsQuery({
    stage: "lease_signed",
    limit: 200,
  });

  const applicants = applicantsResponse?.items ?? [];

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

  if (loadingApplicants) {
    return (
      <div className="h-8 w-48 animate-pulse rounded bg-muted" aria-busy="true" />
    );
  }

  if (applicants.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic">
        No lease-signed tenants to link to.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="border rounded px-2 py-1.5 text-sm bg-background min-h-[36px] max-w-[220px]"
          aria-label="Select tenant"
        >
          <option value="">— select tenant —</option>
          {applicants.map((a) => (
            <option key={a.id} value={a.id}>
              {a.legal_name ?? "Unnamed"}
            </option>
          ))}
        </select>
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
      </div>
      {isAlreadyAttributed && currentAttributionSource && (
        <p className="text-[11px] text-muted-foreground">
          Currently linked
          {currentAttributionSource === "auto_exact" && " (auto — exact match)"}
          {currentAttributionSource === "auto_fuzzy_confirmed" && " (auto — fuzzy confirmed)"}
          {currentAttributionSource === "manual" && " (manual)"}
        </p>
      )}
    </div>
  );
}
