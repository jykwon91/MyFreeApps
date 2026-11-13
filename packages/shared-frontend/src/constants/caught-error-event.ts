/**
 * The window event an error boundary dispatches when it catches a crash (see
 * announceCaughtError). The no-backend Playwright suites listen for it so a
 * page that crashes into its fallback fails the test, even though the rest of
 * the app keeps rendering.
 */
export const CAUGHT_ERROR_EVENT = "platform:caught-error";
