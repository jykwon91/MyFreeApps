import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import { useCanWrite } from "@/shared/hooks/useOrgRole";
import LeaseTemplateUploadDialog from "@/app/features/leases/LeaseTemplateUploadDialog";
import { resolveListLoadMode } from "@/shared/lib/list-load-mode";
import LeaseTemplatesListBody from "@/app/features/leases/LeaseTemplatesListBody";
import LoadErrorAlert from "@/shared/components/ui/LoadErrorAlert";
import LoadMoreFooter from "@/shared/components/ui/LoadMoreFooter";
import { useLeaseTemplatesPages } from "@mybookkeeper/api-client/hooks/useLeaseTemplatesPages";

export default function LeaseTemplates() {
  const canWrite = useCanWrite();
  const navigate = useNavigate();
  const { templates, hasData, loadError, isLoading, hasNextPage, isFetchingNextPage, isLoadMoreError, loadMore, refetch } =
    useLeaseTemplatesPages();
  const [uploadOpen, setUploadOpen] = useState(false);

  const mode = resolveListLoadMode({
    hasData,
    hasError: loadError !== undefined,
    itemCount: templates.length,
  });

  return (
    <div className="p-4 sm:p-8 space-y-6">
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

      {loadError ? (
        <LoadErrorAlert message="I couldn't load your templates. Want me to try again?" isRetrying={isLoading} onRetry={() => void refetch()} />
      ) : null}

      <LeaseTemplatesListBody mode={mode} templates={templates} />

      {mode === "list" ? (
        <LoadMoreFooter
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
          isLoadMoreError={isLoadMoreError}
          failureMessage="I couldn't load more templates. Want me to try again?"
          onLoadMore={loadMore}
        />
      ) : null}

      <LeaseTemplateUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onCreated={(created, aiSuggestions) =>
          navigate(`/lease-templates/${created.id}`, {
            state: { aiSuggestions },
          })
        }
      />
    </div>
  );
}
