import { X } from "lucide-react";
import { useToast } from "@/shared/hooks/useToast";
import { useCanWrite } from "@/shared/hooks/useOrgRole";
import { useDismissable } from "@/shared/hooks/useDismissable";
import ReconciliationWizard from "@/app/features/reconciliation/ReconciliationWizard";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import AlertBox from "@/shared/components/ui/AlertBox";

export default function Reconciliation() {
  const { showError, showSuccess } = useToast();
  const canWrite = useCanWrite();
  const { dismissed: infoDismissed, dismiss: dismissInfo } = useDismissable("recon-info-dismissed");

  function handleToast(message: string, variant: "success" | "error") {
    if (variant === "success") showSuccess(message);
    else showError(message);
  }

  return (
    <main className="p-4 sm:p-8 space-y-6">
      <SectionHeader
        title="Reconciliation"
        subtitle="Compare 1099 forms against your reservation records"
      />

      {!infoDismissed && (
        <AlertBox variant="info" className="flex items-center justify-between gap-3">
          <span>
            Reconciliation compares what your rental platform (Airbnb, VRBO) reported on your 1099 against the reservation income I&rsquo;ve tracked. Discrepancies can mean missing income, double-counting, or a platform error &mdash; and they can flag you for an audit.
          </span>
          <button
            onClick={dismissInfo}
            aria-label="Dismiss"
            className="p-1 rounded hover:bg-blue-100 dark:hover:bg-blue-900 text-blue-800 dark:text-blue-200 shrink-0"
          >
            <X size={14} />
          </button>
        </AlertBox>
      )}

      <ReconciliationWizard onToast={handleToast} canWrite={canWrite} />

    </main>
  );
}
