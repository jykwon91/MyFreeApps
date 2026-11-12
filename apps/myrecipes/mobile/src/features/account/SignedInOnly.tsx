import { SessionPendingScreen, useSession } from "@platform/mobile";
import { Redirect } from "expo-router";
import { SETTINGS_ROUTE } from "../../constants/security";
import type { SignedInOnlyProps } from "../../types/SignedInOnlyProps";

/**
 * MyRecipes works signed out, so its account screens guard themselves: until it's known who this
 * is they wait, and signed out they go to Settings, which offers sign-in.
 */
export default function SignedInOnly({ children }: SignedInOnlyProps) {
  const { state } = useSession();
  if (state.status === "signedIn") return children;
  if (state.status === "restoring") return <SessionPendingScreen />;
  return <Redirect href={SETTINGS_ROUTE} />;
}
