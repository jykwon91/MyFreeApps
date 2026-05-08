import type { PublicListing } from "@/shared/types/inquiry/public-listing";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import TurnstileWidget from "@/shared/components/ui/TurnstileWidget";
import type { FieldErrors, FormState, ValidatedField } from "./public-inquiry-types";
import PublicInquiryContactSection from "./PublicInquiryContactSection";
import PublicInquiryBackgroundSection from "./PublicInquiryBackgroundSection";

interface PublicInquiryFormStepProps {
  listing: PublicListing;
  form: FormState;
  submitting: boolean;
  submitError: string;
  visibleErrors: FieldErrors;
  errorCount: number;
  attemptedSubmit: boolean;
  turnstileRequired: boolean;
  turnstileError: string;
  update: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  markTouched: (key: ValidatedField) => void;
  onTurnstileVerify: (token: string) => void;
  onTurnstileExpire: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

export default function PublicInquiryFormStep({
  listing,
  form,
  submitting,
  submitError,
  visibleErrors,
  errorCount,
  attemptedSubmit,
  turnstileRequired,
  turnstileError,
  update,
  markTouched,
  onTurnstileVerify,
  onTurnstileExpire,
  onSubmit,
}: PublicInquiryFormStepProps) {
  const showSummary = attemptedSubmit && errorCount > 0;

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4"
      data-testid="public-inquiry-form"
      aria-label="Public inquiry form"
      noValidate
    >
      {showSummary ? (
        <div
          role="alert"
          className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700"
          data-testid="public-inquiry-summary"
        >
          Please fix {errorCount} {errorCount === 1 ? "issue" : "issues"} below.
        </div>
      ) : null}

      {/* Honeypot — visually hidden but real DOM. Bots that fill every
          input flip the gate. NOT display:none because some bots
          intentionally skip those fields. */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: "-10000px",
          width: "1px",
          height: "1px",
          overflow: "hidden",
        }}
      >
        <label>
          Website
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            data-testid="public-inquiry-honeypot"
            value={form.website}
            onChange={(e) => update("website", e.target.value)}
          />
        </label>
      </div>

      <PublicInquiryContactSection
        listing={listing}
        form={form}
        visibleErrors={visibleErrors}
        update={update}
        markTouched={markTouched}
      />

      <PublicInquiryBackgroundSection
        form={form}
        visibleErrors={visibleErrors}
        update={update}
        markTouched={markTouched}
      />

      {turnstileRequired ? (
        <div>
          <TurnstileWidget
            onVerify={onTurnstileVerify}
            onExpire={onTurnstileExpire}
          />
          {turnstileError ? (
            <p
              className="mt-1 text-xs text-red-600"
              role="alert"
              data-testid="public-inquiry-turnstile-error"
            >
              {turnstileError}
            </p>
          ) : null}
        </div>
      ) : null}

      {submitError ? (
        <p
          className="text-sm text-red-600"
          data-testid="public-inquiry-error"
          role="alert"
        >
          {submitError}
        </p>
      ) : null}

      <LoadingButton
        type="submit"
        isLoading={submitting}
        loadingText="Submitting..."
        disabled={submitting}
        className="w-full min-h-[44px]"
        data-testid="public-inquiry-submit"
      >
        Send inquiry
      </LoadingButton>
    </form>
  );
}
