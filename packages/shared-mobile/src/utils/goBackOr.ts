import { type Href, router } from "expo-router";

/** A screen opened cold (a notification, a link) has nothing behind it, so Back goes to `fallback` instead of nowhere. */
export function goBackOr(fallback: Href): void {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}
