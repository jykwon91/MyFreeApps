/**
 * Screens that open from a tap. A fast double tap pushes twice, and Back then
 * appears to do nothing, so each of these keeps one copy per id in the stack.
 */
export const SINGLE_COPY_SCREENS = ["analyze", "applications/new", "applications/[id]", "companies/index", "companies/[id]", "delete-account", "discover", "documents", "resume", "security/index", "security/turn-on"] as const;
