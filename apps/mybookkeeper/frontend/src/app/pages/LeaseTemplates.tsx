import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import EmptyState from "@/shared/components/ui/EmptyState";
import AlertBox from "@/shared/components/ui/AlertBox";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import { useGetLeaseTemplatesQuery } from "@/shared/store/leaseTemplatesApi";
import { useCanWrite } from "@/shared/hooks/useOrgRole";
import LeaseTemplatesListSkeleton from "@/app/features/leases/LeaseTemplatesListSkeleton";
import LeaseTemplateCard from "@/app/features/leases/LeaseTemplateCard";
import LeaseTemplateUploadDialog from "@/app/features/leases/LeaseTemplateUploadDialog";

export default function LeaseTemplates() {
  const canWrite = useCanWrite();
  const navigate = useNavigate();
  const { data, isLoading, isFetching, isError, refetch } =
    useGetLeaseTemplatesQuery();
  const [uploadOpen, setUploadOpen] = useState(false);

  const templates = data?.items ?? [];

  return (
    <main className="p-4 sm:p-8 space-y-6">
      <SectionHeader
        title="Lease Templates"
        subtitle="Reusable lease bundles. Upload once, generate filled leases per applicant."
        actions={
          canWrite ? (
            <button
              type="button"
              onClick={() => setUploadOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:opacity-90 min-h-[44px]"
              data-testid="lease-template-upload-button"
            >
              <Plus size={16} />
              Upload template
            </button>
          ) : null
        }
      />

      {isError ? (
        <AlertBox variant="error" className="flex items-center justify-between gap-3">
          <span>I couldn't load your templates. Want me to try again?</span>
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

      {isLoading ? (
        <LeaseTemplatesListSkeleton />
      ) : templates.length === 0 && !isError ? (
        <EmptyState
          message="No templates yet — upload one to get started."
        />
      ) : (
        <ul className="space-y-3" data-testid="lease-templates-list">
          {templates.map((t) => (
            <li key={t.id}>
              <LeaseTemplateCard template={t} />
            </li>
          ))}
        </ul>
      )}

      <LeaseTemplateUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onCreated={(created) => navigate(`/lease-templates/${created.id}`)}
      />
    </main>
  );
}
