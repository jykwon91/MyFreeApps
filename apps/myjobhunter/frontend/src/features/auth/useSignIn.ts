import { signIn, register } from "@/lib/auth";
import { showError } from "@platform/ui";

interface UseSignInResult {
  handleSignIn: (email: string, password: string) => Promise<void>;
  handleRegister: (email: string, password: string) => Promise<void>;
}

/**
 * Wraps signIn/register helpers from lib/auth for use with LoginForm.
 * Shows a toast on unexpected errors that aren't surfaced by LoginForm itself.
 */
export function useSignIn(): UseSignInResult {
  async function handleSignIn(email: string, password: string): Promise<void> {
    try {
      await signIn(email, password);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Couldn't sign you in — please try again.";
      showError(message);
      throw err;
    }
  }

  async function handleRegister(
    email: string,
    password: string
  ): Promise<void> {
    try {
      await register(email, password);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Couldn't create your account — please try again.";
      showError(message);
      throw err;
    }
  }

  return { handleSignIn, handleRegister };
}
