import { router } from "expo-router";

/** A link opened cold has no screen behind it, so Back goes to `fallback` instead of nowhere. */
export function goBackOr(fallback: string): void {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}
