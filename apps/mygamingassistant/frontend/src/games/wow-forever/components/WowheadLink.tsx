import { OutboundLink } from "@platform/ui/discord-activity";

interface WowheadLinkProps {
  /** Absolute Wowhead Forever URL (item or spell). */
  href: string;
  className?: string;
}

/**
 * "Look it up on Wowhead" — an outbound link to a Wowhead Forever page.
 * Opens in a new tab (browser) or via Discord's openExternalLink (Activity).
 */
export default function WowheadLink({ href, className }: WowheadLinkProps) {
  return (
    <OutboundLink href={href} className={className ?? "text-sm text-primary underline"}>
      Look it up on Wowhead
    </OutboundLink>
  );
}
