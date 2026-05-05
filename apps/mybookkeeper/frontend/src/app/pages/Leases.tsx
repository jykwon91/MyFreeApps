import { useState } from "react";
import { useNavigate } from "react-router-dom";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import AlertBox from "@/shared/components/ui/AlertBox";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import Button from "@/shared/components/ui/Button";
import { useCanWrite } from "@/shared/hooks/useOrgRole";
import { useGetSignedLeasesQuery } from "@/shared/store/signedLeasesApi";
import LeaseImportDialog from "@/app/features/leases/LeaseImportDialog";
import { useLeasesListMode } from "@/app/features/leases/useLeasesListMode";
import LeasesListBody from "@/app/features/leases/LeasesListBody";

export default function Leases() {
  const canWrite = useCanWrite();
  const navigate = useNavigate();
  const [showImportDialog, setShowImportDialog] = useState(false);
  const { data, isLoading, isFetching, isError, refetch } =
    useGetSignedLeasesQuery();
  const leases = data?.items ?? [];
  const mode = useLeasesListMode({ isLoading, isError, leaseCount: leases.length });

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

      {isError ? (
        <AlertBox variant="error" className="flex items-center justify-between gap-3">
          <span>I couldn't load your leases. Want me to try again?</span>
          <LoadingButton
            variant="secondary"
            size="sm"
            isLoading={isFetching}
            loadingText="Retrying..."
            onClick={() => refetch()}
          >
            Retry
          </LoadingButton>
        </AlertBox>
      ) : null}

      <LeasesListBody mode={mode} leases={leases} />
    </main>
  );
}
