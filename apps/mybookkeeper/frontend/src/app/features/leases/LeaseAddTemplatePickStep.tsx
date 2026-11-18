import { Button, LoadingButton } from "@platform/ui";
import type { LeaseTemplateSummary } from "@mybookkeeper/api-client/types/lease/lease-template-summary";
import type { ListLoadMode } from "@/shared/types/list-load-mode";
import type { LeaseTemplatesPagesState } from "@mybookkeeper/api-client/types/lease/lease-templates-pages-state";
import ListPagesErrorAlert from "@/shared/components/ui/ListPagesErrorAlert";
import LoadMoreButton from "@/shared/components/ui/LoadMoreButton";
import LeaseAddTemplatePickBody from "./LeaseAddTemplatePickBody";

export interface LeaseAddTemplatePickStepProps {
  available: readonly LeaseTemplateSummary[];
  linkedSet: Set<string>;
  selectedIds: string[];
  onToggle: (template: LeaseTemplateSummary) => void;
  isDocumentsLocked: boolean;
  mode: ListLoadMode;
  pages: LeaseTemplatesPagesState;
  isPrefilling: boolean;
  onContinue: () => void;
  onClose: () => void;
}

/**
 * Step 1 of the Add Document modal: pick one or more templates from the
 * host's library. Already-linked templates are listed with a small
 * "picking will regenerate" badge so the host can knowingly trigger a
 * regenerate via the same flow. Once the lease is sent or signed they are
 * disabled instead, since its documents are never made again.
 */
export default function LeaseAddTemplatePickStep({
  available,
  linkedSet,
  selectedIds,
  onToggle,
  isDocumentsLocked,
  mode,
  pages,
  isPrefilling,
  onContinue,
  onClose,
}: LeaseAddTemplatePickStepProps) {
  return (
    <>
      <ListPagesErrorAlert pages={pages} noun="templates" />
      <LeaseAddTemplatePickBody
        mode={mode}
        available={available}
        linkedSet={linkedSet}
        selectedIds={selectedIds}
        onToggle={onToggle}
        isDocumentsLocked={isDocumentsLocked}
      />
      {mode === "list" ? (
        <LoadMoreButton hasNextPage={pages.hasNextPage} isFetchingNextPage={pages.isFetchingNextPage} onLoadMore={pages.loadMore} />
      ) : null}

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <LoadingButton
          isLoading={isPrefilling}
          loadingText="Loading fields..."
          disabled={selectedIds.length === 0 || isPrefilling}
          onClick={onContinue}
          data-testid="lease-add-template-continue"
        >
          Continue
        </LoadingButton>
      </div>
    </>
  );
}
