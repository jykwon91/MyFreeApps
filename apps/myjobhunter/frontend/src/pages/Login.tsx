import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { LoginForm, TurnstileWidget, useIsAuthenticated } from "@platform/ui";
import { useSignIn } from "@/features/auth/useSignIn";

interface LocationState {
  from?: string;
}

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const isAuthenticated = useIsAuthenticated();
  const { handleSignIn, handleRegister } = useSignIn();

  // Captured Turnstile token. Held in a ref so handleRegister (which is
  // re-created every render by LoginForm's submit handler) always reads
  // the latest value without forcing a re-render.
  const turnstileTokenRef = useRef("");
  const [, setTokenTick] = useState(0);

  const onTurnstileVerify = useCallback((token: string) => {
    turnstileTokenRef.current = token;
    setTokenTick((n) => n + 1);
  }, []);

  const onTurnstileExpire = useCallback(() => {
    turnstileTokenRef.current = "";
    setTokenTick((n) => n + 1);
  }, []);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      const state = location.state as LocationState | null;
      navigate(state?.from ?? "/dashboard", { replace: true });
    }
  }, [isAuthenticated, navigate, location.state]);

  async function onSignIn(email: string, password: string): Promise<void> {
    await handleSignIn(email, password);
    const state = location.state as LocationState | null;
    navigate(state?.from ?? "/dashboard", { replace: true });
  }

  async function onRegister(email: string, password: string): Promise<void> {
    await handleRegister(email, password, turnstileTokenRef.current);
    navigate("/dashboard", { replace: true });
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-muted/30 px-4">
      {/* App logo */}
      <div className="mb-8 flex flex-col items-center gap-2">
        <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
          <span className="text-primary-foreground font-bold text-xl">J</span>
        </div>
        <span className="text-xl font-semibold tracking-tight">MyJobHunter</span>
      </div>

      {/* Login card */}
      <div className="w-full max-w-sm bg-background border rounded-xl p-8 shadow-xs">
        <LoginForm
          onSignIn={onSignIn}
          onRegister={onRegister}
          trustCopy="Your job search data stays private. No recruiter access, no data resale, ever."
          passwordMinLength={12}
          registerCaptchaSlot={
            <TurnstileWidget
              onVerify={onTurnstileVerify}
              onExpire={onTurnstileExpire}
            />
          }
        />
      </div>

      {/* Footer */}
      <p className="mt-8 text-xs text-muted-foreground">
        &copy; 2026 MyJobHunter
      </p>
    </div>
  );
}
