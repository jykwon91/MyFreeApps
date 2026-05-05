/**
 * Discriminated union for the JD paste / parse UX state in AddApplicationDialog.
 *
 * States:
 * - idle: textarea hidden; "Paste JD to auto-fill" button visible
 * - pasting: textarea visible; "Parse with AI" button visible
 * - parsing: API call in flight; button shows spinner
 * - parsed: fields pre-filled from Claude; success banner visible
 * - failed: API call returned error; error message visible
 *
 * The flat switch over `mode.kind` in the component avoids nested ternaries
 * and makes each state's rendering path explicit.
 */
export type JdParseMode =
  | { kind: "idle" }
  | { kind: "pasting"; jdText: string }
  | { kind: "parsing"; jdText: string }
  | { kind: "parsed"; summary: string | null }
  | { kind: "failed"; errorMessage: string };

export const JD_PARSE_MODE_IDLE: JdParseMode = { kind: "idle" };
