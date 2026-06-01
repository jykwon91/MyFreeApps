import { cn } from "../../utils/cn";
import ExternalLink from "../icons/ExternalLink";

interface Props {
  /** The Ko-fi page URL to open. */
  url: string;
  label?: string;
  className?: string;
}

/**
 * Primary donate CTA. Renders a real `<a>` (not a button) so middle-click,
 * ctrl-click, and "copy link" work, and opens Ko-fi in a new tab. Mirrors the
 * `Button` primary variant's classes — Button renders a `<button>` and can't be
 * an anchor; a future `as` prop on Button could de-duplicate this.
 */
export default function KofiButton({ url, label = "Support on Ko-fi", className }: Props) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium min-h-[44px]",
        "bg-primary text-primary-foreground hover:opacity-90",
        className,
      )}
    >
      {label}
      <span className="sr-only">(opens in a new tab)</span>
      <span aria-hidden="true">
        <ExternalLink className="h-4 w-4" />
      </span>
    </a>
  );
}
