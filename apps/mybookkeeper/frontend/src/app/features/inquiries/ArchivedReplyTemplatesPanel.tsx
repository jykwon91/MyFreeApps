import { useRef } from "react";
import { useGetArchivedReplyTemplatesQuery } from "@mybookkeeper/api-client/store/inquiriesApi";
import EmptyState from "@/shared/components/ui/EmptyState";
import { useCanWrite } from "@/shared/hooks/useOrgRole";
import { REPLY_TEMPLATE_MESSAGES as MESSAGES } from "@/shared/lib/reply-template-messages";
import ArchivedReplyTemplatesList from "./ArchivedReplyTemplatesList";
import ReplyTemplatesRetry from "./ReplyTemplatesRetry";
import ReplyTemplatesSkeleton from "./ReplyTemplatesSkeleton";
import { useReplyTemplatesLoad } from "./useReplyTemplatesLoad";

export interface ArchivedReplyTemplatesPanelProps {
  onShowActive: () => void;
}

export default function ArchivedReplyTemplatesPanel({ onShowActive }: ArchivedReplyTemplatesPanelProps) {
  const canWrite = useCanWrite();
  const query = useGetArchivedReplyTemplatesQuery();
  const panel = useRef<HTMLDivElement>(null);
  const { mode, retry, isRetrying } = useReplyTemplatesLoad(query, panel);
  const onRetry = () => void retry();

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
        return <ReplyTemplatesSkeleton variant="archived" label={MESSAGES.loadingArchived} actions={canWrite ? 1 : 0} />;
      case "error":
        return <ReplyTemplatesRetry message={MESSAGES.couldntLoadArchived} announce="alert" isRetrying={isRetrying} onRetry={onRetry} />;
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
              <ReplyTemplatesRetry message={MESSAGES.showingLastLoadedArchived} announce="status" isRetrying={isRetrying} onRetry={onRetry} />
            ) : null}
            <p className="text-xs text-muted-foreground">
              {canWrite ? MESSAGES.archivedIntro : MESSAGES.archivedIntroViewer}
            </p>
            <ArchivedReplyTemplatesList
              templates={query.currentData ?? []}
              canWrite={canWrite}
              onRestored={() => panel.current?.focus()}
            />
          </div>
        );
    }
  }
}
