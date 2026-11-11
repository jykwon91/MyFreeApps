/**
 * Screens that open from a tap. A fast double tap pushes twice, and Back then
 * appears to do nothing, so each of these keeps one copy per id in the stack.
 */
export const SINGLE_COPY_SCREENS = ["applications/new", "applications/[id]", "companies/index", "companies/[id]", "delete-account", "documents"] as const;
