import { Button, LoadingButton } from "@platform/ui";
import type { LeaseTemplateSummary } from "@mybookkeeper/api-client/types/lease/lease-template-summary";
import type { ListLoadMode } from "@/shared/types/list-load-mode";
import LoadErrorAlert from "@/shared/components/ui/LoadErrorAlert";
import LoadMoreFooter from "@/shared/components/ui/LoadMoreFooter";
import LeaseAddTemplatePickBody from "./LeaseAddTemplatePickBody";

export interface LeaseAddTemplatePickStepProps {
  available: LeaseTemplateSummary[];
  linkedSet: Set<string>;
  selectedIds: string[];
  onToggle: (template: LeaseTemplateSummary) => void;
  isDocumentsLocked: boolean;
  mode: ListLoadMode;
  /** The latest load failed; items from an earlier load may still show. */
  hasError: boolean;
  isRetrying: boolean;
  hasMore: boolean;
  isLoadingMore: boolean;
  loadMoreFailed: boolean;
  onLoadMore: () => void;
  isPrefilling: boolean;
  onRetry: () => void;
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
  hasError,
  isRetrying,
  hasMore,
  isLoadingMore,
  loadMoreFailed,
  onLoadMore,
  isPrefilling,
  onRetry,
  onContinue,
  onClose,
}: LeaseAddTemplatePickStepProps) {
  return (
    <>
      {hasError ? (
        <LoadErrorAlert message="I couldn't load your templates. Want me to try again?" isRetrying={isRetrying} onRetry={onRetry} />
      ) : null}
      <LeaseAddTemplatePickBody
        mode={mode}
        available={available}
        linkedSet={linkedSet}
        selectedIds={selectedIds}
        onToggle={onToggle}
        isDocumentsLocked={isDocumentsLocked}
      />
      {mode === "list" ? (
        <LoadMoreFooter
          hasMore={hasMore}
          isLoadingMore={isLoadingMore}
          loadMoreFailed={loadMoreFailed}
          failureMessage="I couldn't load more templates. Want me to try again?"
          onLoadMore={onLoadMore}
        />
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
