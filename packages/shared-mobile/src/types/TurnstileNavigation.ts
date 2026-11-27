/** What the captcha WebView does with a page it's asked to load: load it, hand it to the phone's browser, or drop it. */
export type TurnstileNavigation = "load" | "openOutside" | "block";
