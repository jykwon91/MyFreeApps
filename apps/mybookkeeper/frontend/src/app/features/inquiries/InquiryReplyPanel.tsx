import { useEffect, useRef, useState } from "react";
import { Panel, PanelCloseButton, PanelTitle } from "@platform/ui";
import { Button, LoadingButton } from "@platform/ui";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import { useGetIntegrationsQuery } from "@mybookkeeper/api-client/store/integrationsApi";
import {
  useGetReplyTemplatesQuery,
  useLazyRenderReplyTemplateQuery,
  useSendInquiryReplyMutation,
} from "@mybookkeeper/api-client/store/inquiriesApi";
import type { ReplyTemplate } from "@mybookkeeper/api-client/types/inquiry/reply-template";
import InquiryReplyPanelBody from "./InquiryReplyPanelBody";
import { useInquiryReplyMode } from "./useInquiryReplyMode";
import { useReplyTemplatesLoad } from "./useReplyTemplatesLoad";

export interface InquiryReplyPanelProps {
  inquiryId: string;
  onClose: () => void;
}

type ReplyTab = "template" | "custom";

type ReconnectReason =
  | "missing-integration"
  | "missing-send-scope"
  | "reauth-required"
  | null;

function deriveReconnectReason(
  integrationsLoading: boolean,
  gmail: { needs_reauth?: boolean; has_send_scope?: boolean } | undefined,
): ReconnectReason {
  if (integrationsLoading) return null;
  if (!gmail) return "missing-integration";
  if (gmail.needs_reauth) return "reauth-required";
  if (gmail.has_send_scope === false) return "missing-send-scope";
  return null;
}

/**
 * Right-side slide-in (mobile: bottom sheet) for composing a templated
 * reply to an inquiry. The Panel component switches automatically between
 * the two layouts based on viewport width.
 *
 * Flow:
 *   1. On open: fetch template list and Gmail integration status.
 *   2. If Gmail is missing OR lacks send scope → show reconnect banner
 *      and disable the composer.
 *   3. Otherwise: host picks a template OR switches to "Write custom".
 *      Selecting a template fires GET /render-template/{templateId} so
 *      the composer pre-fills with substituted text.
 *   4. Host edits subject/body, hits Send, mutation fires POST /reply.
 *   5. On success: panel closes, toast confirms, inquiry refetches via
 *      RTK tag invalidation.
 */
export default function InquiryReplyPanel({ inquiryId, onClose }: InquiryReplyPanelProps) {
  const [tab, setTab] = useState<ReplyTab>("template");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  // Local overrides allow the user to edit the rendered template content.
  // When a new render arrives, the overrides reset (via key change below).
  const [subjectOverride, setSubjectOverride] = useState<string | null>(null);
  const [bodyOverride, setBodyOverride] = useState<string | null>(null);

  // Which template last failed to fill in; it keeps its Try again while retrying.
  const [renderFailedFor, setRenderFailedFor] = useState<string | null>(null);
  const latestRender = useRef<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  // After a Try again fills the template in, focus goes to its Subject.
  const focusSubjectWhenFilled = useRef(false);

  const templatesQuery = useGetReplyTemplatesQuery();
  const templatesLoad = useReplyTemplatesLoad(templatesQuery, bodyRef);
  const { data: integrations = [], isLoading: integrationsLoading } =
    useGetIntegrationsQuery();
  const [triggerRender, renderState] = useLazyRenderReplyTemplateQuery();
  const [sendReply, { isLoading: isSending }] = useSendInquiryReplyMutation();

  const gmail = integrations.find((i) => i.provider === "gmail");
  const reconnectReason = deriveReconnectReason(integrationsLoading, gmail);
  const mode = useInquiryReplyMode({ reconnectReason, tab });

  // Derive subject/body: prefer local override (user edits), fall back to
  // server-rendered template data, then empty string.
  // currentData belongs to the latest render only, so a failed render never
  // shows the previous template's text; Write custom never takes a template's.
  const rendered = tab === "template" ? renderState.currentData : undefined;
  const isRenderFetching = tab === "template" && renderState.isFetching;
  const subject = subjectOverride ?? rendered?.subject ?? "";
  const body = bodyOverride ?? rendered?.body ?? "";
  const renderFailed = selectedTemplateId !== null && renderFailedFor === selectedTemplateId;

  useEffect(() => {
    if (!focusSubjectWhenFilled.current || renderFailed || isRenderFetching) return;
    if (!subjectRef.current) return;
    focusSubjectWhenFilled.current = false;
    subjectRef.current.focus();
  }, [renderFailed, isRenderFetching]);

  function handleSubjectChange(value: string) {
    setSubjectOverride(value);
  }

  function handleBodyChange(value: string) {
    setBodyOverride(value);
  }

  function handleSelectTemplate(template: ReplyTemplate) {
    setSelectedTemplateId(template.id);
    // Clear local overrides so the newly-rendered template fills the editor.
    setSubjectOverride(null);
    setBodyOverride(null);
    setRenderFailedFor(null);
    focusSubjectWhenFilled.current = false;
    void runRender(template.id);
  }

  async function runRender(templateId: string) {
    latestRender.current = templateId;
    const result = await triggerRender({ inquiryId, templateId });
    if (latestRender.current !== templateId) return;
    setRenderFailedFor(result.isError ? templateId : null);
  }

  function retryRender() {
    if (!selectedTemplateId) return;
    focusSubjectWhenFilled.current = true;
    void runRender(selectedTemplateId);
  }

  function handleSwitchTab(next: ReplyTab) {
    setTab(next);
    focusSubjectWhenFilled.current = false;
    if (next === "custom") {
      setSelectedTemplateId(null);
      setSubjectOverride(null);
      setBodyOverride(null);
    }
  }

  async function handleSend() {
    if (!subject.trim() || !body.trim()) {
      showError("Add a subject and a message before sending.");
      return;
    }
    try {
      await sendReply({
        inquiryId,
        data: {
          template_id: tab === "template" ? selectedTemplateId : null,
          subject: subject.trim(),
          body,
        },
      }).unwrap();
      showSuccess("Reply sent.");
      onClose();
    } catch {
      showError("I couldn't send that reply. Want to try again?");
    }
  }

  const canSend =
    !reconnectReason &&
    subject.trim().length > 0 &&
    body.trim().length > 0 &&
    !isSending &&
    !isRenderFetching &&
    !renderFailed;

  return (
    <Panel position="right" onClose={onClose} width="640px">
      <div
        className="flex flex-col flex-1 overflow-hidden"
        data-testid="inquiry-reply-panel"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b flex items-start justify-between">
          <div>
            <PanelTitle asChild>
              <h3 className="font-medium text-base">Reply with template</h3>
            </PanelTitle>
            <p className="text-xs text-muted-foreground">
              Sends via your connected Gmail address.
            </p>
          </div>
          <PanelCloseButton onClose={onClose} />
        </div>

        {/* Tabs */}
        <div className="px-5 pt-3 flex gap-2 border-b" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "template"}
            onClick={() => handleSwitchTab("template")}
            data-testid="reply-tab-template"
            className={`px-3 py-2 text-sm border-b-2 -mb-[2px] min-h-[44px] ${
              tab === "template"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground"
            }`}
          >
            Use template
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "custom"}
            onClick={() => handleSwitchTab("custom")}
            data-testid="reply-tab-custom"
            className={`px-3 py-2 text-sm border-b-2 -mb-[2px] min-h-[44px] ${
              tab === "custom"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground"
            }`}
          >
            Write custom
          </button>
        </div>

        {/* Body */}
        <div ref={bodyRef} tabIndex={-1} className="flex-1 overflow-y-auto p-5 space-y-4 focus:outline-none">
          <InquiryReplyPanelBody
            mode={mode}
            reconnectReason={reconnectReason}
            templates={templatesQuery.currentData ?? []}
            templatesLoad={templatesLoad}
            selectedTemplateId={selectedTemplateId}
            render={{
              isFetching: isRenderFetching,
              failed: renderFailed,
              onRetry: retryRender,
            }}
            isSending={isSending}
            subject={subject}
            body={body}
            onSelectTemplate={handleSelectTemplate}
            onSubjectChange={handleSubjectChange}
            onBodyChange={handleBodyChange}
            onBrowseTemplates={onClose}
            subjectRef={subjectRef}
          />
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t flex items-center justify-end gap-2">
          <Button variant="secondary" size="md" onClick={onClose}>
            Cancel
          </Button>
          <LoadingButton
            variant="primary"
            size="md"
            isLoading={isSending}
            loadingText="Sending..."
            disabled={!canSend}
            onClick={() => void handleSend()}
            data-testid="reply-send-button"
          >
            Send reply
          </LoadingButton>
        </div>
      </div>
    </Panel>
  );
}
