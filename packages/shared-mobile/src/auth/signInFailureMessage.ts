import type { SignInFailure } from "../types/SignInFailure";

export function signInFailureMessage(failure: SignInFailure, appName: string): string {
  switch (failure) {
    case "bad_credentials":
      return "That email or password isn't right. Check them and try again.";
    case "not_verified":
      return "Verify your email before signing in. We sent a link when you signed up. To get a new one, open the website and try signing in there.";
    case "invalid_totp":
      return "Invalid authentication code. Each code works once, so wait for the next one and try again.";
    case "rate_limited":
      return "Too many attempts. Wait a few minutes, then try again.";
    case "unreachable":
      return `Can't reach ${appName}. Check your connection and try again.`;
    case "storage":
      return "Your phone couldn't save your sign-in, so you're not signed in. Try again.";
    case "unexpected":
      return "Something went wrong. Please try again.";
  }
}
