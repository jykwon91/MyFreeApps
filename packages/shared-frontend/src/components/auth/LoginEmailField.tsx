import { LOGIN_FORM_COPY } from "../../constants/login-form-copy";
import type { LoginEmailFieldProps } from "../../types/login-email-field-props";

export default function LoginEmailField({ value, onChange, disabled, autoFocus }: LoginEmailFieldProps) {
  return (
    <div className="space-y-1">
      <label htmlFor="login-email" className="text-sm font-medium">
        {LOGIN_FORM_COPY.email}
      </label>
      <input
        id="login-email"
        type="email"
        autoComplete="email"
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        autoFocus={autoFocus}
        className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50 min-h-[44px]"
      />
    </div>
  );
}
