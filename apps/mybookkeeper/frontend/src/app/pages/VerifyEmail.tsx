import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import api from "@/shared/lib/api";
import { extractErrorMessage } from "@/shared/utils/errorMessage";

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
    <div className="min-h-screen flex items-center justify-center bg-muted">
      <div className="bg-card border rounded-lg p-8 w-full max-w-sm shadow-sm text-center">
        <h1 className="text-2xl font-semibold mb-4">MyBookkeeper</h1>

        {state === "verifying" && (
          <>
            <div className="flex justify-center mb-4">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
            <p className="text-muted-foreground text-sm">Verifying your email...</p>
          </>
        )}

        {state === "success" && (
          <>
            <p className="text-sm text-muted-foreground mb-6">
              Your email has been verified. You can now sign in.
            </p>
            <Link
              to="/login"
              className="inline-block bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:bg-primary/90"
            >
              Sign in
            </Link>
          </>
        )}

        {state === "error" && (
          <>
            <p className="text-destructive text-sm mb-6">{errorMessage}</p>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Need a new link?{" "}
                <Link to="/login" className="text-primary hover:underline">
                  Go to login
                </Link>{" "}
                and request a new verification email.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
