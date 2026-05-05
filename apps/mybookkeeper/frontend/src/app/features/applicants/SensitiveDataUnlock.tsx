import { useState } from "react";
import { Eye, EyeOff, ShieldAlert } from "lucide-react";

export interface SensitiveDataUnlockProps {
  children: React.ReactNode;
  /**
   * Optional override label for the toggle button. Defaults to a generic
   * "Show sensitive data" / "Hide sensitive data".
   */
  showLabel?: string;
  hideLabel?: string;
}

/**
 * Wrapper that hides PII (legal_name, dob, employer_or_hospital,
 * vehicle_make_model) behind a "Show sensitive data" toggle.
 *
 * Per RENTALS_PLAN.md §9.1: the applicant detail page must NOT render PII
 * by default. The host clicks to reveal — a deliberate, audit-friendly
 * action that protects against shoulder-surfing and accidental screen-share
 * leaks.
 */
export default function SensitiveDataUnlock({
  children,
  showLabel = "Show sensitive data",
  hideLabel = "Hide sensitive data",
}: SensitiveDataUnlockProps) {
  const [revealed, setRevealed] = useState(false);

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
          onClick={() => setRevealed((p) => !p)}
          aria-pressed={revealed}
          data-testid="sensitive-data-toggle"
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline min-h-[44px] px-3"
        >
          {revealed ? (
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
      {revealed ? (
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
