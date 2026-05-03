import { useState } from "react";
import Panel, { PanelCloseButton } from "@/shared/components/ui/Panel";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import Button from "@/shared/components/ui/Button";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import { useGetIntegrationsQuery } from "@/shared/store/integrationsApi";
import {
  useGetReplyTemplatesQuery,
  useLazyRenderReplyTemplateQuery,
  useSendInquiryReplyMutation,
} from "@/shared/store/inquiriesApi";
import type { ReplyTemplate } from "@/shared/types/inquiry/reply-template";
import GmailReconnectBanner from "./GmailReconnectBanner";
import RenderedReplyEditor from "./RenderedReplyEditor";
import ReplyTemplatePicker from "./ReplyTemplatePicker";

interface Props {
  inquiryId: string;
  onClose: () => void;
}

type ReplyTab = "template" | "custom";

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
export default function InquiryReplyPanel({ inquiryId, onClose }: Props) {
  const [tab, setTab] = useState<ReplyTab>("template");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  // Local overrides allow the user to edit the rendered template content.
  // When a new render arrives, the overrides reset (via key change below).
  const [subjectOverride, setSubjectOverride] = useState<string | null>(null);
  const [bodyOverride, setBodyOverride] = useState<string | null>(null);

  const { data: templates = [], isLoading: templatesLoading } =
    useGetReplyTemplatesQuery();
  const { data: integrations = [], isLoading: integrationsLoading } =
    useGetIntegrationsQuery();
  const [triggerRender, renderState] = useLazyRenderReplyTemplateQuery();
  const [sendReply, { isLoading: isSending }] = useSendInquiryReplyMutation();

  const gmail = integrations.find((i) => i.provider === "gmail");
  const reconnectReason: "missing-integration" | "missing-send-scope" | null =
    integrationsLoading
      ? null
      : !gmail
        ? "missing-integration"
        : gmail.has_send_scope === false
          ? "missing-send-scope"
          : null;

  // Derive subject/body: prefer local override (user edits), fall back to
  // server-rendered template data, then empty string.
  const subject = subjectOverride ?? renderState.data?.subject ?? "";
  const body = bodyOverride ?? renderState.data?.body ?? "";

  function setSubject(value: string) {
    setSubjectOverride(value);
  }

  function setBody(value: string) {
    setBodyOverride(value);
  }

  function handleSelectTemplate(template: ReplyTemplate) {
    setSelectedTemplateId(template.id);
    // Clear local overrides so the newly-rendered template fills the editor.
    setSubjectOverride(null);
    setBodyOverride(null);
    void triggerRender({ inquiryId, templateId: template.id });
  }

  function handleSwitchTab(next: ReplyTab) {
    setTab(next);
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
    reconnectReason === null &&
    subject.trim().length > 0 &&
    body.trim().length > 0 &&
    !isSending &&
    !renderState.isFetching;

  return (
    <Panel position="right" onClose={onClose} width="640px">
      <div
        className="flex flex-col flex-1 overflow-hidden"
        data-testid="inquiry-reply-panel"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b flex items-start justify-between">
          <div>
            <h3 className="font-medium text-base">Reply with template</h3>
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
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {reconnectReason !== null ? (
            <GmailReconnectBanner reason={reconnectReason} />
          ) : null}

          {tab === "template" && reconnectReason === null ? (
            <>
              <div>
                <h4 className="text-sm font-medium mb-2">Choose a template</h4>
                {templatesLoading ? (
                  <div
                    className="text-sm text-muted-foreground"
                    data-testid="reply-templates-loading"
                  >
                    Loading templates...
                  </div>
                ) : (
                  <ReplyTemplatePicker
                    templates={templates}
                    selectedTemplateId={selectedTemplateId}
                    onSelect={handleSelectTemplate}
                  />
                )}
              </div>
              {selectedTemplateId !== null ? (
                <div className="border-t pt-4">
                  <h4 className="text-sm font-medium mb-2">Preview &amp; edit</h4>
                  {renderState.isFetching ? (
                    <div
                      className="text-sm text-muted-foreground"
                      data-testid="reply-render-loading"
                    >
                      Hmm, let me build that for you...
                    </div>
                  ) : (
                    <RenderedReplyEditor
                      subject={subject}
                      body={body}
                      onSubjectChange={setSubject}
                      onBodyChange={setBody}
                      disabled={isSending}
                    />
                  )}
                </div>
              ) : null}
            </>
          ) : null}

          {tab === "custom" && reconnectReason === null ? (
            <RenderedReplyEditor
              subject={subject}
              body={body}
              onSubjectChange={setSubject}
              onBodyChange={setBody}
              disabled={isSending}
            />
          ) : null}
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
