/** What the Turnstile page inside the WebView reports. `ready` means the widget is on screen. */
export type TurnstileMessage =
  | { type: "ready" }
  | { type: "token"; token: string }
  | { type: "expired" }
  | { type: "error"; code: string };
