/** A Lever company slug as the backend keeps it: trimmed and lowercase. */
export function normalizeCompanySlug(slug: string): string {
  return slug.trim().toLowerCase();
}
