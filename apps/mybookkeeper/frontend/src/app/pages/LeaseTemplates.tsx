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
import { useLeaseTemplatePages } from "@/app/features/leases/useLeaseTemplatePages";

export default function LeaseTemplates() {
  const canWrite = useCanWrite();
  const navigate = useNavigate();
  const { templates, hasData, loadError, isFetching, hasMore, isLoadingMore, loadMoreFailed, loadMore, reload } =
    useLeaseTemplatePages();
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
        <LoadErrorAlert message="I couldn't load your templates. Want me to try again?" isRetrying={isFetching} onRetry={() => void reload()} />
      ) : null}

      <LeaseTemplatesListBody mode={mode} templates={templates} />

      {mode === "list" ? (
        <LoadMoreFooter
          hasMore={hasMore}
          isLoadingMore={isLoadingMore}
          loadMoreFailed={loadMoreFailed}
          failureMessage="I couldn't load more templates. Want me to try again?"
          onLoadMore={() => void loadMore()}
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
