/**
 * Discriminated union for the JD paste / parse / fetch UX state in
 * AddApplicationDialog.
 *
 * The dialog supports two input modes — URL ("Paste a link") and free-text
 * ("Paste the description text"). The URL path defaults because the
 * operator's stated preference is paste-link first; both call the
 * Add Application form pre-fill flow when they succeed.
 *
 * States:
 * - idle:   panel collapsed; "Paste link or description to auto-fill" visible
 * - pasting (text): textarea visible; "Parse with AI" button visible
 * - fetching (url): URL input visible; "Fetch" button visible
 * - parsing: text-parse API call in flight; button shows spinner
 * - extracting: URL-extract API call in flight; button shows spinner
 * - parsed: fields pre-filled successfully; success banner visible
 * - failed: API call returned an error; error message visible
 * - authRequired: URL was auth-walled (LinkedIn / Glassdoor / tiny-page);
 *   error banner with a "Switch to paste-text" affordance
 *
 * The flat switch over `mode.kind` in the component avoids nested ternaries
 * and makes each state's rendering path explicit.
 *
 * Carrying `jdText` and `url` through the parsing/extracting states means
 * the user's input survives an in-flight error — the textarea or URL
 * input redisplays the original value when the API throws.
 */
export type JdParseMode =
  | { kind: "idle" }
  | { kind: "pasting"; jdText: string }
  | { kind: "fetching"; url: string }
  | { kind: "parsing"; jdText: string }
  | { kind: "extracting"; url: string }
  | { kind: "parsed"; summary: string | null; sourceUrl: string | null }
  | { kind: "failed"; errorMessage: string }
  | { kind: "authRequired"; url: string };

export const JD_PARSE_MODE_IDLE: JdParseMode = { kind: "idle" };

/**
 * Tab selector for the input method. Persisted in component state so
 * switching tabs doesn't lose the user's typed input — see
 * AddApplicationDialog.handleSwitchTab for the preservation logic.
 */
export type JdInputTab = "url" | "text";

export const JD_INPUT_TAB_DEFAULT: JdInputTab = "url";
