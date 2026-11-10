export interface ContactLinkProps {
  label: string;
  /** Where the link goes, or null when the value isn't safe to open: it then shows as plain text. */
  url: string | null;
  hint: string;
  /** What to show instead of `label` when there's no link, so the raw value is still readable. Defaults to `label`. */
  plainLabel?: string;
}
