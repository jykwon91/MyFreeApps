import { Eye, EyeOff, LoaderCircle, ShieldAlert } from "lucide-react";

export interface SensitiveDataUnlockProps {
  children: React.ReactNode;
  errorMessage?: string | null;
  isLoading?: boolean;
  isRevealed: boolean;
  onHide: () => void;
  onShow: () => void;
  /**
   * Optional override label for the toggle button. Defaults to a generic
   * "Show sensitive data" / "Hide sensitive data".
   */
  showLabel?: string;
  hideLabel?: string;
}

/**
 * Hides private applicant details until the host asks for them. The parent
 * fetches them from the audited reveal on ``onShow``, so they aren't in the
 * browser until then, and each request is recorded.
 *
 * Per RENTALS_PLAN.md §9.1: the applicant detail page must NOT render PII
 * by default. This protects against shoulder-surfing and accidental
 * screen-share leaks.
 */
export default function SensitiveDataUnlock({
  children,
  errorMessage,
  isLoading = false,
  isRevealed,
  onHide,
  onShow,
  showLabel = "Show sensitive data",
  hideLabel = "Hide sensitive data",
}: SensitiveDataUnlockProps) {
  return (
    <section
      className="border rounded-lg p-4 space-y-3"
      data-testid="sensitive-data-section"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          Sensitive
        </h2>
        <button
          type="button"
          onClick={isRevealed ? onHide : onShow}
          disabled={isLoading}
          aria-busy={isLoading}
          aria-pressed={isRevealed}
          data-testid="sensitive-data-toggle"
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline min-h-[44px] px-3 disabled:opacity-60"
        >
          {isLoading ? (
            <>
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
              Loading...
            </>
          ) : isRevealed ? (
            <>
              <EyeOff className="h-4 w-4" aria-hidden="true" />
              {hideLabel}
            </>
          ) : (
            <>
              <Eye className="h-4 w-4" aria-hidden="true" />
              {showLabel}
            </>
          )}
        </button>
      </div>
      {errorMessage ? (
        <p className="text-xs text-destructive" role="alert" data-testid="sensitive-data-error">
          {errorMessage}
        </p>
      ) : null}
      {isRevealed ? (
        <div data-testid="sensitive-data-revealed">{children}</div>
      ) : (
        <p
          className="text-xs text-muted-foreground italic"
          data-testid="sensitive-data-hidden"
        >
          Hidden until you click "{showLabel}".
        </p>
      )}
    </section>
  );
}
