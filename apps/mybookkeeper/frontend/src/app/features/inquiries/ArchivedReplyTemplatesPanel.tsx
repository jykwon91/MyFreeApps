import { useRef } from "react";
import { useGetArchivedReplyTemplatesQuery } from "@mybookkeeper/api-client/store/inquiriesApi";
import EmptyState from "@/shared/components/ui/EmptyState";
import { useCanWrite } from "@/shared/hooks/useOrgRole";
import { REPLY_TEMPLATE_MESSAGES as MESSAGES } from "@/shared/lib/reply-template-messages";
import ArchivedReplyTemplatesList from "./ArchivedReplyTemplatesList";
import ArchivedReplyTemplatesRetry from "./ArchivedReplyTemplatesRetry";
import ArchivedReplyTemplatesSkeleton from "./ArchivedReplyTemplatesSkeleton";
import { archivedReplyTemplatesMode } from "./archivedReplyTemplatesMode";

export interface ArchivedReplyTemplatesPanelProps {
  onShowActive: () => void;
}

export default function ArchivedReplyTemplatesPanel({ onShowActive }: ArchivedReplyTemplatesPanelProps) {
  const canWrite = useCanWrite();
  const { currentData, isError, isFetching, refetch } = useGetArchivedReplyTemplatesQuery();
  const panel = useRef<HTMLDivElement>(null);
  const mode = archivedReplyTemplatesMode({ templates: currentData, isError, isFetching });
  const retry = () => void refetch();

  return (
    // A restored row leaves the list, and the last one takes the list with it,
    // so focus comes to the panel itself rather than falling to the page.
    <div ref={panel} tabIndex={-1} className="focus:outline-none" data-testid="archived-reply-templates-panel">
      {renderMode()}
    </div>
  );

  function renderMode() {
    switch (mode) {
      case "loading":
        return <ArchivedReplyTemplatesSkeleton canWrite={canWrite} />;
      case "error":
        return <ArchivedReplyTemplatesRetry message={MESSAGES.couldntLoadArchived} isRetrying={isFetching} onRetry={retry} />;
      case "empty":
        return (
          <EmptyState
            message={canWrite ? MESSAGES.noArchived : MESSAGES.noArchivedViewer}
            action={{ label: MESSAGES.backToActive, onClick: onShowActive }}
          />
        );
      case "stale":
      case "list":
        return (
          <div className="space-y-3">
            {mode === "stale" ? (
              <ArchivedReplyTemplatesRetry message={MESSAGES.showingLastLoaded} isRetrying={isFetching} onRetry={retry} />
            ) : null}
            <p className="text-xs text-muted-foreground">
              {canWrite ? MESSAGES.archivedIntro : MESSAGES.archivedIntroViewer}
            </p>
            <ArchivedReplyTemplatesList
              templates={currentData ?? []}
              canWrite={canWrite}
              onRestored={() => panel.current?.focus()}
            />
          </div>
        );
    }
  }
}
