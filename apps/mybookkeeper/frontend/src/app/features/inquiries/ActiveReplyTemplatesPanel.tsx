import { useRef } from "react";
import { useGetReplyTemplatesQuery } from "@mybookkeeper/api-client/store/inquiriesApi";
import type { ReplyTemplate } from "@mybookkeeper/api-client/types/inquiry/reply-template";
import { useCanWrite } from "@/shared/hooks/useOrgRole";
import { REPLY_TEMPLATE_MESSAGES as MESSAGES } from "@/shared/lib/reply-template-messages";
import ReplyTemplatesEmpty from "./ReplyTemplatesEmpty";
import ReplyTemplatesList from "./ReplyTemplatesList";
import ReplyTemplatesRetry from "./ReplyTemplatesRetry";
import ReplyTemplatesSkeleton from "./ReplyTemplatesSkeleton";
import { useReplyTemplatesLoad } from "./useReplyTemplatesLoad";

export interface ActiveReplyTemplatesPanelProps {
  onEdit: (template: ReplyTemplate) => void;
  onArchive: (template: ReplyTemplate) => void;
  onView: (template: ReplyTemplate) => void;
}

export default function ActiveReplyTemplatesPanel({ onEdit, onArchive, onView }: ActiveReplyTemplatesPanelProps) {
  const canWrite = useCanWrite();
  const query = useGetReplyTemplatesQuery();
  const panel = useRef<HTMLDivElement>(null);
  const { mode, retry, isRetrying } = useReplyTemplatesLoad(query, panel);
  const onRetry = () => void retry();

  return (
    <div ref={panel} tabIndex={-1} className="focus:outline-none" data-testid="active-reply-templates-panel">
      {renderMode()}
    </div>
  );

  function renderMode() {
    switch (mode) {
      case "loading":
        return <ReplyTemplatesSkeleton variant="active" label={MESSAGES.loadingActive} actions={canWrite ? 2 : 1} />;
      case "error":
        return <ReplyTemplatesRetry message={MESSAGES.couldntLoadActive} announce="alert" isRetrying={isRetrying} onRetry={onRetry} />;
      case "empty":
        return <ReplyTemplatesEmpty canWrite={canWrite} />;
      case "stale":
      case "list":
        return (
          <div className="space-y-3">
            {mode === "stale" ? (
              <ReplyTemplatesRetry message={MESSAGES.showingLastLoadedActive} announce="status" isRetrying={isRetrying} onRetry={onRetry} />
            ) : null}
            <ReplyTemplatesList templates={query.currentData ?? []} canWrite={canWrite} onEdit={onEdit} onArchive={onArchive} onView={onView} />
          </div>
        );
    }
  }
}
