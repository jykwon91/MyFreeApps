import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { extractErrorMessage } from "@platform/ui";
import api from "@/lib/api";

type VerifyState = "verifying" | "success" | "error";

const NO_TOKEN_MESSAGE =
  "No verification token found in the link. Please check your email and try again.";

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  // Initialize directly from token presence — avoids calling setState inside an effect.
  const [state, setState] = useState<VerifyState>(token ? "verifying" : "error");
  const [errorMessage, setErrorMessage] = useState(token ? "" : NO_TOKEN_MESSAGE);

  useEffect(() => {
    if (!token) return;

    api
      .post("/auth/verify", { token })
      .then(() => setState("success"))
      .catch((err: unknown) => {
        setState("error");
        setErrorMessage(extractErrorMessage(err));
      });
  }, [token]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-muted/30 px-4">
      <div className="mb-8 flex flex-col items-center gap-2">
        <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
          <span className="text-primary-foreground font-bold text-xl">J</span>
        </div>
        <span className="text-xl font-semibold tracking-tight">MyJobHunter</span>
      </div>

      <div className="w-full max-w-sm bg-background border rounded-xl p-8 shadow-xs text-center">
        {state === "verifying" && (
          <>
            <div className="flex justify-center mb-4">
              <div
                className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"
                role="status"
                aria-label="Verifying your email"
              />
            </div>
            <p className="text-muted-foreground text-sm">Verifying your email...</p>
          </>
        )}

        {state === "success" && (
          <>
            <h1 className="text-lg font-semibold mb-2">You're verified.</h1>
            <p className="text-sm text-muted-foreground mb-6">
              Your email has been verified. You can now sign in.
            </p>
            <Link
              to="/login"
              className="inline-block bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:bg-primary/90 min-h-[44px] leading-7"
            >
              Sign in
            </Link>
          </>
        )}

        {state === "error" && (
          <>
            <h1 className="text-lg font-semibold mb-2">Couldn't verify</h1>
            <p className="text-destructive text-sm mb-6" role="alert">
              {errorMessage}
            </p>
            <p className="text-sm text-muted-foreground">
              Need a new link?{" "}
              <Link to="/login" className="text-primary hover:underline">
                Go to sign in
              </Link>{" "}
              and request a new verification email.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
