import { useEffect, useRef, useState } from "react";
import Panel, { PanelCloseButton } from "@/shared/components/ui/Panel";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import Button from "@/shared/components/ui/Button";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import {
  useCreateReplyTemplateMutation,
  useUpdateReplyTemplateMutation,
} from "@/shared/store/inquiriesApi";
import type { ReplyTemplate } from "@/shared/types/inquiry/reply-template";

export interface ReplyTemplateFormProps {
  template: ReplyTemplate | null;
  onClose: () => void;
}

const VARIABLES = [
  "$name",
  "$listing",
  "$dates",
  "$start_date",
  "$end_date",
  "$employer",
  "$host_name",
  "$host_phone",
];

const NAME_MAX = 100;
const SUBJECT_MAX = 500;
const BODY_MAX = 10000;

/** Add / edit form for a reply template — slide-in panel. */
export default function ReplyTemplateForm({ template, onClose }: ReplyTemplateFormProps) {
  const [name, setName] = useState(template?.name ?? "");
  const [subject, setSubject] = useState(template?.subject_template ?? "");
  const [body, setBody] = useState(template?.body_template ?? "");
  const [createTemplate, { isLoading: isCreating }] =
    useCreateReplyTemplateMutation();
  const [updateTemplate, { isLoading: isUpdating }] =
    useUpdateReplyTemplateMutation();

  // When the parent swaps the template prop (e.g., the manager opens edit for
  // a different template after first opening another), refresh local form state.
  // Tracking the previously-seen template id avoids re-setting on every render
  // while still responding to genuine prop changes.
  const prevTemplateIdRef = useRef(template?.id);
  useEffect(() => {
    if (template?.id !== prevTemplateIdRef.current) {
      prevTemplateIdRef.current = template?.id;
      setName(template?.name ?? "");
      setSubject(template?.subject_template ?? "");
      setBody(template?.body_template ?? "");
    }
  }, [template]);

  const isEdit = template !== null;
  const isSubmitting = isCreating || isUpdating;
  const canSave = name.trim() && subject.trim() && body.trim() && !isSubmitting;

  async function handleSave() {
    try {
      if (isEdit && template) {
        await updateTemplate({
          id: template.id,
          data: {
            name: name.trim(),
            subject_template: subject.trim(),
            body_template: body,
          },
        }).unwrap();
        showSuccess("Template updated.");
      } else {
        await createTemplate({
          name: name.trim(),
          subject_template: subject.trim(),
          body_template: body,
        }).unwrap();
        showSuccess("Template created.");
      }
      onClose();
    } catch {
      showError("I couldn't save that template. Want to try again?");
    }
  }

  return (
    <Panel position="right" onClose={onClose} width="560px">
      <div
        className="flex flex-col flex-1 overflow-hidden"
        data-testid="reply-template-form"
      >
        <div className="px-5 py-4 border-b flex items-start justify-between">
          <div>
            <h3 className="font-medium text-base">
              {isEdit ? "Edit template" : "New template"}
            </h3>
            <p className="text-xs text-muted-foreground">
              Use variables like $name, $listing, $dates — they'll be filled in
              when you reply.
            </p>
          </div>
          <PanelCloseButton onClose={onClose} />
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label
              htmlFor="template-name"
              className="text-xs text-muted-foreground block mb-1"
            >
              Name
            </label>
            <input
              id="template-name"
              type="text"
              value={name}
              maxLength={NAME_MAX}
              onChange={(e) => setName(e.target.value)}
              data-testid="reply-template-form-name"
              className="w-full border rounded px-3 py-2 text-sm min-h-[44px]"
            />
          </div>
          <div>
            <label
              htmlFor="template-subject"
              className="text-xs text-muted-foreground block mb-1"
            >
              Subject
            </label>
            <input
              id="template-subject"
              type="text"
              value={subject}
              maxLength={SUBJECT_MAX}
              onChange={(e) => setSubject(e.target.value)}
              data-testid="reply-template-form-subject"
              className="w-full border rounded px-3 py-2 text-sm min-h-[44px]"
            />
          </div>
          <div>
            <label
              htmlFor="template-body"
              className="text-xs text-muted-foreground block mb-1 flex items-center justify-between"
            >
              <span>Body</span>
              <span aria-live="polite">
                {body.length.toLocaleString()} / {BODY_MAX.toLocaleString()}
              </span>
            </label>
            <textarea
              id="template-body"
              value={body}
              maxLength={BODY_MAX}
              onChange={(e) => setBody(e.target.value)}
              data-testid="reply-template-form-body"
              rows={12}
              className="w-full border rounded px-3 py-2 text-sm font-mono min-h-[200px]"
            />
          </div>
          <div className="text-xs text-muted-foreground">
            <p className="mb-1 font-medium">Available variables:</p>
            <div className="flex flex-wrap gap-2">
              {VARIABLES.map((v) => (
                <code
                  key={v}
                  className="px-2 py-0.5 rounded bg-muted text-foreground"
                >
                  {v}
                </code>
              ))}
            </div>
          </div>
        </div>

        <div className="px-5 py-4 border-t flex items-center justify-end gap-2">
          <Button variant="secondary" size="md" onClick={onClose}>
            Cancel
          </Button>
          <LoadingButton
            variant="primary"
            size="md"
            isLoading={isSubmitting}
            loadingText="Saving..."
            disabled={!canSave}
            onClick={() => void handleSave()}
            data-testid="reply-template-form-submit"
          >
            {isEdit ? "Save changes" : "Create template"}
          </LoadingButton>
        </div>
      </div>
    </Panel>
  );
}
