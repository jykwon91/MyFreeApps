import { router } from "expo-router";

/** A deep link has nothing to go back to. */
export function leaveToMortgages(): void {
  if (router.canGoBack()) router.back();
  else router.replace("/mortgages");
}
