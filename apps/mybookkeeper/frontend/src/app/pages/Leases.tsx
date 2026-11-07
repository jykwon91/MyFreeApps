import { useState } from "react";
import { useNavigate } from "react-router-dom";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import { Button } from "@platform/ui";
import { useCanWrite } from "@/shared/hooks/useOrgRole";
import {
  useGetSignedLeasesQuery,
  useDeleteSignedLeaseMutation,
} from "@mybookkeeper/api-client/store/signedLeasesApi";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import LeaseImportDialog from "@/app/features/leases/LeaseImportDialog";
import { resolveListLoadMode } from "@/shared/lib/list-load-mode";
import LeasesListBody from "@/app/features/leases/LeasesListBody";
import type { SignedLeaseSummary } from "@mybookkeeper/api-client/types/lease/signed-lease-summary";
import LoadErrorAlert from "@/shared/components/ui/LoadErrorAlert";

export default function Leases() {
  const canWrite = useCanWrite();
  const navigate = useNavigate();
  const [showImportDialog, setShowImportDialog] = useState(false);
  const { data, isFetching, error, refetch } =
    useGetSignedLeasesQuery();
  const [deleteLease, { isLoading: isDeleting }] = useDeleteSignedLeaseMutation();
  const leases = data?.items ?? [];
  const mode = resolveListLoadMode({
    hasData: data !== undefined,
    hasError: error !== undefined,
    itemCount: leases.length,
  });

  async function handleDelete(lease: SignedLeaseSummary) {
    try {
      await deleteLease(lease.id).unwrap();
      showSuccess("Lease deleted.");
    } catch {
      showError("Couldn't delete that lease. Please try again.");
    }
  }

  return (
    <main className="p-4 sm:p-8 space-y-6">
      {showImportDialog ? (
        <LeaseImportDialog onClose={() => setShowImportDialog(false)} />
      ) : null}

      <SectionHeader
        title="Leases"
        subtitle="Generated and imported leases per applicant. Upload signed PDFs and attachments here."
        actions={
          canWrite ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                onClick={() => navigate("/leases/new")}
                data-testid="generate-lease-button"
              >
                Generate lease
              </Button>
              <Button
                variant="secondary"
                onClick={() => setShowImportDialog(true)}
                data-testid="import-signed-lease-button"
              >
                Import signed lease
              </Button>
            </div>
          ) : null
        }
      />

      {error ? (
        <LoadErrorAlert message="I couldn't load your leases. Want me to try again?" isRetrying={isFetching} onRetry={() => refetch()} />
      ) : null}

      <LeasesListBody
        mode={mode}
        leases={leases}
        canWrite={canWrite}
        onDelete={handleDelete}
        isDeleting={isDeleting}
      />
    </main>
  );
}
