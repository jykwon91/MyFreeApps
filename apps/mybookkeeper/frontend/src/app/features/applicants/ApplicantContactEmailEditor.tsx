import { useId, useState } from "react";
import { Button, LoadingButton } from "@platform/ui";
import { APPLICANT_CONTACT_EMAIL_MESSAGES as MESSAGES } from "@mybookkeeper/api-client/constants/applicantContactEmail";
import { useUpdateApplicantContactEmailMutation } from "@mybookkeeper/api-client/store/applicantsApi";
import { useToast } from "@/shared/hooks/useToast";
import { getApiErrorDetail } from "@/shared/lib/api-error-detail";

export interface ApplicantContactEmailEditorProps {
  applicantId: string;
  email: string | null;
  canWrite: boolean;
}

/**
 * The applicant's email, with a way to add, change or remove it. Shown inside
 * the revealed Sensitive section, so the address is only on screen once the
 * host has asked for it.
 */
export default function ApplicantContactEmailEditor({
  applicantId,
  email,
  canWrite,
}: ApplicantContactEmailEditorProps) {
  const inputId = useId();
  const { showError, showSuccess } = useToast();
  const [updateEmail, { isLoading }] = useUpdateApplicantContactEmailMutation();
  // The revealed details aren't refetched after a save, so track what's saved here.
  const [saved, setSaved] = useState(email);
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(next: string | null) {
    setError(null);
    try {
      await updateEmail({ applicantId, data: { contact_email: next } }).unwrap();
      setSaved(next);
      setDraft(null);
      showSuccess(next ? MESSAGES.saved : MESSAGES.removed);
    } catch (err: unknown) {
      if ((err as { status?: unknown } | undefined)?.status === 422) {
        setError(MESSAGES.invalid);
      } else {
        showError(getApiErrorDetail(err, MESSAGES.failed));
      }
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = (draft ?? "").trim();
    void save(trimmed || null);
  }

  if (draft !== null) {
    return (
      <div>
        <label htmlFor={inputId} className="text-xs text-muted-foreground block">
          {MESSAGES.label}
        </label>
        <form onSubmit={handleSubmit} className="mt-0.5 flex flex-wrap items-center gap-2">
          <input
            id={inputId}
            type="email"
            autoComplete="off"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={isLoading}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${inputId}-error` : undefined}
            className="rounded border bg-background px-2 py-1 text-sm min-h-[44px] flex-1 min-w-[12rem] disabled:opacity-50"
          />
          <LoadingButton type="submit" size="sm" isLoading={isLoading} loadingText={MESSAGES.saving}>
            {MESSAGES.save}
          </LoadingButton>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={isLoading}
            onClick={() => {
              setDraft(null);
              setError(null);
            }}
          >
            {MESSAGES.cancel}
          </Button>
        </form>
        {error ? (
          <p id={`${inputId}-error`} role="alert" className="mt-1 text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <dt className="text-xs text-muted-foreground">{MESSAGES.label}</dt>
      <dd data-testid="sensitive-contact-email" className="flex flex-wrap items-center gap-x-2">
        {saved ? (
          <a href={`mailto:${encodeURIComponent(saved)}`} className="text-primary hover:underline">
            {saved}
          </a>
        ) : (
          "—"
        )}
        {canWrite ? (
          <button
            type="button"
            onClick={() => setDraft(saved ?? "")}
            className="text-sm text-primary hover:underline min-h-[44px] px-1"
          >
            {saved ? MESSAGES.change : MESSAGES.add}
          </button>
        ) : null}
      </dd>
    </div>
  );
}
