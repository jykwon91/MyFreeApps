// eslint-disable-next-line no-control-regex -- matching control characters is the point
const CONTROL_CHARACTERS = /[\x00-\x1F\x7F]/;

/**
 * The in-app path to go back to after signing in, or null when `value` isn't
 * one. A `returnTo` query parameter is visitor-controlled, so only a path that
 * stays on this origin is kept: one leading "/", no control characters
 * (browsers drop tab, CR and LF, so `/\t/evil.example` would become
 * `//evil.example`), and it must resolve to this origin (which also refuses
 * `/\evil.example`, read as `//evil.example`).
 */
export function safeReturnPath(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return null;
  if (CONTROL_CHARACTERS.test(value)) return null;
  const { origin } = window.location;
  return new URL(value, origin).origin === origin ? value : null;
}
