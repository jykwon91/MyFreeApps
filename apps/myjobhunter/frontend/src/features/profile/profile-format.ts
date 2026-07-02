/**
 * Pure display helpers for the Profile page.
 * Extracted from pages/Profile.tsx (file-size no-growth policy).
 */

export const REMOTE_PREF_LABELS: Record<string, string> = {
  remote_only: "Remote only",
  hybrid: "Hybrid",
  onsite: "On-site",
  any: "Open to all",
};

export function formatDateRange(
  start: string,
  end: string | null,
  isCurrent: boolean,
): string {
  const fmt = (d: string) => {
    const [year, month] = d.split("-");
    return new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
    });
  };
  if (isCurrent) {
    return `${fmt(start)} – Present`;
  }
  return end ? `${fmt(start)} – ${fmt(end)}` : `${fmt(start)} – No end date`;
}
