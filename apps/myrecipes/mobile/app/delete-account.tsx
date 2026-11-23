import { DeleteAccountScreen, useSession } from "@platform/mobile";
import { router } from "expo-router";
import { useEffect } from "react";
import { ACCOUNT_COPY } from "@myrecipes/api-client/constants/accountCopy";

export default function DeleteAccountRoute() {
  const { state } = useSession();
  // MyRecipes works signed out, so nothing else closes this once the account is gone.
  const isSignedOut = state.status === "signedOut";
  useEffect(() => {
    if (isSignedOut) router.replace("/");
  }, [isSignedOut]);

  return <DeleteAccountScreen warning={ACCOUNT_COPY.deleteWarning} />;
}
