import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import { useCanWrite } from "@/shared/hooks/useOrgRole";
import LeaseTemplateUploadDialog from "@/app/features/leases/LeaseTemplateUploadDialog";
import { pagedListView } from "@/shared/lib/paged-list-view";
import LeaseTemplatesListBody from "@/app/features/leases/LeaseTemplatesListBody";
import ListPagesErrorAlert from "@/shared/components/ui/ListPagesErrorAlert";
import LoadMoreButton from "@/shared/components/ui/LoadMoreButton";
import { useLeaseTemplatesPages } from "@mybookkeeper/api-client/hooks/useLeaseTemplatesPages";

export default function LeaseTemplates() {
  const canWrite = useCanWrite();
  const navigate = useNavigate();
  const pages = useLeaseTemplatesPages();
  const [uploadOpen, setUploadOpen] = useState(false);

  const { mode, rows } = pagedListView(pages, pages.templates);

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

      <ListPagesErrorAlert pages={pages} noun="templates" />

      <LeaseTemplatesListBody mode={mode} templates={rows} />

      {mode === "list" ? (
        <LoadMoreButton hasNextPage={pages.hasNextPage} isFetchingNextPage={pages.isFetchingNextPage} onLoadMore={pages.loadMore} />
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
