import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

export interface PasswordPairProps {
  /** Current value of the primary password field. Controlled. */
  password: string;
  onPasswordChange: (next: string) => void;
  /** Current value of the confirm field. Controlled. */
  confirmPassword: string;
  onConfirmPasswordChange: (next: string) => void;
  /**
   * Notify the parent whether the pair is valid (length OK + matches).
   * The parent uses this to enable/disable the submit button. Optional —
   * parents that already track form validity locally can ignore it.
   */
  onValidityChange?: (isValid: boolean) => void;
  /** Minimum password length. Defaults to 12 (matches OWASP / NIST 2026). */
  minLength?: number;
  /** Label for the primary password input. Defaults to "Password". */
  label?: string;
  /** Label for the confirm input. Defaults to "Confirm password". */
  confirmLabel?: string;
  /** Placeholder for the primary input. */
  placeholder?: string;
  /** Placeholder for the confirm input. */
  confirmPlaceholder?: string;
  /** When true, the inputs are read-only and the toggle is disabled. */
  disabled?: boolean;
}

/**
 * A two-password input pair with show/hide toggle and inline match
 * validation. Both fields share the same masked / unmasked state — a
 * toggle that revealed only one would defeat the confirm field.
 *
 * Validation timing follows the g-design-ux 2026-05-06 review:
 *   * Mismatch error fires on **blur** of the confirm field, not on
 *     every keystroke. Showing "Passwords don't match" after the
 *     user's second character of a 20-char password is premature.
 *   * Error has ``role="alert"`` so screen readers announce it the
 *     moment it appears.
 *   * ``aria-describedby`` on each input links to the relevant
 *     helper text.
 *
 * The component is a controlled-only — parent owns ``password`` /
 * ``confirmPassword`` state. ``onValidityChange`` is the suggested way
 * to wire submit-button disabling, but parents can compute validity
 * themselves if they need to.
 *
 * Used by both MBK and MJH Register pages — see
 * ``apps/{mybookkeeper,myjobhunter}/frontend/src/...Register.tsx``.
 */
export default function PasswordPair({
  password,
  onPasswordChange,
  confirmPassword,
  onConfirmPasswordChange,
  onValidityChange,
  minLength = 12,
  label = "Password",
  confirmLabel = "Confirm password",
  placeholder = `At least ${12} characters`,
  confirmPlaceholder = "Confirm your password",
  disabled = false,
}: PasswordPairProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [confirmTouched, setConfirmTouched] = useState(false);

  const tooShort = password.length > 0 && password.length < minLength;
  const mismatch = confirmTouched && confirmPassword !== password;
  const isValid =
    password.length >= minLength && password === confirmPassword;

  // Fire validity callback AFTER render, not during. Otherwise we'd
  // setState-in-render the parent.
  useEffect(() => {
    if (onValidityChange) onValidityChange(isValid);
  }, [isValid, onValidityChange]);

  const hintId = "platform-password-hint";
  const errorId = "platform-password-confirm-error";

  return (
    <>
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-sm font-medium">{label}</label>
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            disabled={disabled}
            aria-label={showPassword ? "Hide passwords" : "Show passwords"}
            aria-pressed={showPassword}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            {showPassword ? (
              <EyeOff size={14} aria-hidden="true" />
            ) : (
              <Eye size={14} aria-hidden="true" />
            )}
            <span>{showPassword ? "Hide" : "Show"}</span>
          </button>
        </div>
        <input
          type={showPassword ? "text" : "password"}
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          required
          minLength={minLength}
          placeholder={placeholder}
          autoComplete="new-password"
          aria-describedby={hintId}
          aria-invalid={tooShort}
          disabled={disabled}
        />
        <p id={hintId} className="text-xs text-muted-foreground mt-1">
          At least {minLength} characters.
        </p>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">{confirmLabel}</label>
        <input
          type={showPassword ? "text" : "password"}
          value={confirmPassword}
          onChange={(e) => onConfirmPasswordChange(e.target.value)}
          onBlur={() => setConfirmTouched(true)}
          className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          required
          minLength={minLength}
          placeholder={confirmPlaceholder}
          autoComplete="new-password"
          aria-invalid={mismatch}
          aria-describedby={mismatch ? errorId : undefined}
          disabled={disabled}
        />
        {mismatch ? (
          <p
            id={errorId}
            role="alert"
            className="text-xs text-destructive mt-1"
          >
            Passwords don't match.
          </p>
        ) : null}
      </div>
    </>
  );
}
