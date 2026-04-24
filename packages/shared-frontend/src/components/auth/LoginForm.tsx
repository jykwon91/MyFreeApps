import { useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { Eye, EyeOff } from "lucide-react";
import AlertBox from "@/shared/components/ui/AlertBox";
import LoadingButton from "@/shared/components/ui/LoadingButton";

export interface LoginFormProps {
  onSignIn: (email: string, password: string) => Promise<void>;
  onRegister: (email: string, password: string) => Promise<void>;
  onGoogleSignIn?: () => void;
  defaultTab?: "signin" | "register";
  trustCopy?: string;
  passwordMinLength?: number;
}

const DEFAULT_TRUST_COPY =
  "Your job search data stays private. No recruiter access, no data resale, ever.";

type TabId = "signin" | "register";

export default function LoginForm({
  onSignIn,
  onRegister,
  onGoogleSignIn,
  defaultTab = "signin",
  trustCopy = DEFAULT_TRUST_COPY,
  passwordMinLength = 12,
}: LoginFormProps) {
  const [tab, setTab] = useState<TabId>(defaultTab);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passwordMeetsMin = password.length >= passwordMinLength;
  const signInTabId = "login-tab-signin";
  const registerTabId = "login-tab-register";
  const passwordHelperId = "login-password-helper";
  const errorId = "login-error";

  function handleTabChange(value: string) {
    setTab(value as TabId);
    setEmail("");
    setPassword("");
    setShowPassword(false);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      if (tab === "signin") {
        await onSignIn(email, password);
      } else {
        await onRegister(email, password);
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Something went wrong. Please try again.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm mx-auto">
      {onGoogleSignIn && (
        <>
          <button
            type="button"
            onClick={onGoogleSignIn}
            className="w-full flex items-center justify-center gap-3 border rounded-md px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors min-h-[44px]"
          >
            {/* Google "G" SVG */}
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path
                d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
                fill="#4285F4"
              />
              <path
                d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"
                fill="#34A853"
              />
              <path
                d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
                fill="#FBBC05"
              />
              <path
                d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z"
                fill="#EA4335"
              />
            </svg>
            Continue with Google
          </button>
          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-background px-2 text-xs text-muted-foreground">
                or continue with email
              </span>
            </div>
          </div>
        </>
      )}

      <Tabs.Root value={tab} onValueChange={handleTabChange}>
        <Tabs.List
          aria-labelledby="login-tabs-heading"
          className="flex border-b mb-6"
        >
          <Tabs.Trigger
            id={signInTabId}
            value="signin"
            className="flex-1 py-2 text-sm font-medium text-muted-foreground border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-foreground transition-colors"
          >
            Sign In
          </Tabs.Trigger>
          <Tabs.Trigger
            id={registerTabId}
            value="register"
            className="flex-1 py-2 text-sm font-medium text-muted-foreground border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-foreground transition-colors"
          >
            Create Account
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content
          value="signin"
          aria-labelledby={signInTabId}
        >
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <EmailField
              value={email}
              onChange={setEmail}
              disabled={isLoading}
            />
            <PasswordField
              value={password}
              onChange={setPassword}
              show={showPassword}
              onToggleShow={() => setShowPassword((v) => !v)}
              autoComplete="current-password"
              disabled={isLoading}
              helperId={passwordHelperId}
            />
            <p className="text-xs text-muted-foreground">{trustCopy}</p>
            {error && (
              <AlertBox variant="error" className="text-sm" aria-live="polite">
                <span id={errorId} role="alert">
                  {error}
                </span>
              </AlertBox>
            )}
            <LoadingButton
              type="submit"
              variant="primary"
              isLoading={isLoading}
              loadingText="Signing in..."
              className="w-full"
            >
              Sign In
            </LoadingButton>
          </form>
        </Tabs.Content>

        <Tabs.Content
          value="register"
          aria-labelledby={registerTabId}
        >
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <EmailField
              value={email}
              onChange={setEmail}
              disabled={isLoading}
            />
            <PasswordField
              value={password}
              onChange={setPassword}
              show={showPassword}
              onToggleShow={() => setShowPassword((v) => !v)}
              autoComplete="new-password"
              disabled={isLoading}
              helperId={passwordHelperId}
              showStrengthHint
              passwordMinLength={passwordMinLength}
              passwordMeetsMin={passwordMeetsMin}
            />
            <p className="text-xs text-muted-foreground">{trustCopy}</p>
            {error && (
              <AlertBox variant="error" className="text-sm">
                <span id={errorId} role="alert">
                  {error}
                </span>
              </AlertBox>
            )}
            <LoadingButton
              type="submit"
              variant="primary"
              isLoading={isLoading}
              loadingText="Creating account..."
              disabled={isLoading || !passwordMeetsMin}
              className="w-full"
            >
              Create Account
            </LoadingButton>
          </form>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}

// --- Sub-components (file-scoped, not exported) ---

interface EmailFieldProps {
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}

function EmailField({ value, onChange, disabled }: EmailFieldProps) {
  return (
    <div className="space-y-1">
      <label htmlFor="login-email" className="text-sm font-medium">
        Email
      </label>
      <input
        id="login-email"
        type="email"
        autoComplete="email"
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50 min-h-[44px]"
      />
    </div>
  );
}

interface PasswordFieldProps {
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggleShow: () => void;
  autoComplete: string;
  disabled: boolean;
  helperId: string;
  showStrengthHint?: boolean;
  passwordMinLength?: number;
  passwordMeetsMin?: boolean;
}

function PasswordField({
  value,
  onChange,
  show,
  onToggleShow,
  autoComplete,
  disabled,
  helperId,
  showStrengthHint,
  passwordMinLength,
  passwordMeetsMin,
}: PasswordFieldProps) {
  return (
    <div className="space-y-1">
      <label htmlFor="login-password" className="text-sm font-medium">
        Password
      </label>
      <div className="relative">
        <input
          id="login-password"
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          required
          minLength={passwordMinLength}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          aria-describedby={showStrengthHint ? helperId : undefined}
          className="w-full border rounded-md px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50 min-h-[44px]"
        />
        <button
          type="button"
          onClick={onToggleShow}
          aria-label={show ? "Hide password" : "Show password"}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      {showStrengthHint && passwordMinLength !== undefined && (
        <p
          id={helperId}
          className={
            passwordMeetsMin
              ? "text-xs text-green-600 flex items-center gap-1"
              : "text-xs text-muted-foreground"
          }
        >
          {passwordMeetsMin ? "✓ " : ""}At least {passwordMinLength} characters
        </p>
      )}
    </div>
  );
}
