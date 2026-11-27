import { TURNSTILE_ORIGIN } from "../constants/turnstile";
import type { TurnstileNavigation } from "../types/TurnstileNavigation";
import { isHttpsUrl } from "./isHttpsUrl";
import { webOrigin } from "./webOrigin";

const BLANK_PAGES: ReadonlySet<string> = new Set(["about:blank", "about:srcdoc"]);
/** The rest of a URL that is the site's root page: nothing, or "/", maybe with a query or fragment. */
const ROOT_PAGE = /^\/?(?:[?#].*)?$/;

/**
 * What the captcha WebView does with a page it's asked to load. Inside it: the check's own page (`documentOrigin`'s
 * root, which the WebView reports with or without the slash), Cloudflare's widget, and blank frames. A link the
 * person taps (the widget's privacy or help page) opens in the phone's browser, and only over https. Anything else,
 * including another scheme or a frame from elsewhere, is dropped.
 */
export function turnstileNavigation(url: string, documentOrigin: string, isTopFrame: boolean): TurnstileNavigation {
  if (BLANK_PAGES.has(url)) return "load";
  const origin = webOrigin(url);
  if (origin === TURNSTILE_ORIGIN) return "load";
  if (origin === documentOrigin && ROOT_PAGE.test(url.slice(origin.length))) return "load";
  return isTopFrame && isHttpsUrl(url) ? "openOutside" : "block";
}
