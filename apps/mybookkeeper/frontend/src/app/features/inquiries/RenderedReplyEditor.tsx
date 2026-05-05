export interface RenderedReplyEditorProps {
  subject: string;
  body: string;
  onSubjectChange: (value: string) => void;
  onBodyChange: (value: string) => void;
  disabled?: boolean;
}

const SUBJECT_MAX = 500;
const BODY_MAX = 50000;

/**
 * Controlled subject + body editor used inside the reply panel. Exposes
 * the cap counts so the user knows when they're approaching the backend
 * limit. No formatting tools — replies are plaintext per RENTALS_PLAN
 * §9.2 (the email body goes via Gmail send_message which uses
 * ``message.set_content`` — text/plain).
 */
export default function RenderedReplyEditor({
  subject,
  body,
  onSubjectChange,
  onBodyChange,
  disabled = false,
}: RenderedReplyEditorProps) {
  return (
    <div className="space-y-3">
      <div>
        <label
          htmlFor="reply-subject"
          className="text-xs text-muted-foreground block mb-1"
        >
          Subject
        </label>
        <input
          id="reply-subject"
          type="text"
          value={subject}
          maxLength={SUBJECT_MAX}
          onChange={(e) => onSubjectChange(e.target.value)}
          disabled={disabled}
          data-testid="reply-subject-input"
          className="w-full border rounded px-3 py-2 text-sm min-h-[44px]"
        />
      </div>
      <div>
        <label
          htmlFor="reply-body"
          className="text-xs text-muted-foreground block mb-1 flex items-center justify-between"
        >
          <span>Message</span>
          <span aria-live="polite">
            {body.length.toLocaleString()} / {BODY_MAX.toLocaleString()}
          </span>
        </label>
        <textarea
          id="reply-body"
          value={body}
          maxLength={BODY_MAX}
          onChange={(e) => onBodyChange(e.target.value)}
          disabled={disabled}
          data-testid="reply-body-input"
          rows={12}
          className="w-full border rounded px-3 py-2 text-sm font-mono min-h-[200px]"
        />
      </div>
    </div>
  );
}
