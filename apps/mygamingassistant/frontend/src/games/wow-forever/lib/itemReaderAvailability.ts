import {
  isHumanCheckedFeatureBrowserOnly,
  isHumanCheckedFeatureOffered,
} from "@/games/wow-forever/lib/humanCheckAvailability";

/**
 * Whether to offer the AI screenshot reader at all — the public backend gates it
 * with a Turnstile check (see humanCheckAvailability.ts). When it isn't offered,
 * the compare page falls back to manual entry.
 */
export function isScreenshotReaderOffered(): boolean {
  return isHumanCheckedFeatureOffered();
}

/**
 * Offered, but not inside the Discord Activity: the Activity defaults to pasting
 * text and points to "Open in browser" instead.
 */
export function isScreenshotReaderBrowserOnly(): boolean {
  return isHumanCheckedFeatureBrowserOnly();
}
