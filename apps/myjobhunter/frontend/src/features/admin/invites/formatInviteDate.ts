/**
 * Localized short-date formatter used by every invite UI surface.
 * Lives in its own module so multiple components can share it without
 * duplicating the formatting options.
 */
export function formatInviteDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
