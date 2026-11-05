import { router } from "expo-router";

/** A deep link has nothing to go back to. */
export function leaveToList(): void {
  if (router.canGoBack()) router.back();
  else router.replace("/reply-templates");
}
