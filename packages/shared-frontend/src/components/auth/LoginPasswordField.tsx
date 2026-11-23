import { Eye, EyeOff } from "lucide-react";
import { LOGIN_FORM_COPY } from "../../constants/login-form-copy";
import type { LoginPasswordFieldProps } from "../../types/login-password-field-props";

export default function LoginPasswordField({
  value,
  onChange,
  show,
  onToggleShow,
  autoComplete,
  disabled,
  helperId,
  minLength,
}: LoginPasswordFieldProps) {
  const meetsMin = minLength !== undefined && value.length >= minLength;
  return (
    <div className="space-y-1">
      <label htmlFor="login-password" className="text-sm font-medium">
        {LOGIN_FORM_COPY.password}
      </label>
      <div className="relative">
        <input
          id="login-password"
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          required
          minLength={minLength}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          aria-describedby={minLength !== undefined ? helperId : undefined}
          className="w-full border rounded-md px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50 min-h-[44px]"
        />
        <button
          type="button"
          onClick={onToggleShow}
          aria-label={show ? LOGIN_FORM_COPY.hidePassword : LOGIN_FORM_COPY.showPassword}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      {minLength !== undefined && (
        <p
          id={helperId}
          className={meetsMin ? "text-xs text-green-600 flex items-center gap-1" : "text-xs text-muted-foreground"}
        >
          {meetsMin ? "✓ " : ""}At least {minLength} characters
        </p>
      )}
    </div>
  );
}
