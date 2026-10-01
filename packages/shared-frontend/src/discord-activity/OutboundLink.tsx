import type { AnchorHTMLAttributes, MouseEvent } from "react";
import { isDiscordActivity } from "./launchParams";
import { openExternal } from "./openExternal";

export interface OutboundLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "target" | "rel"> {
  /** Absolute http(s) URL outside the app. */
  href: string;
}

/**
 * A link that leaves the app. On the website it is a plain new-tab link
 * (`target="_blank" rel="noreferrer"`), exactly as before. Inside a Discord
 * Activity — whose sandbox blocks new tabs — the click goes through Discord's
 * `openExternalLink` instead.
 */
export default function OutboundLink({ href, onClick, children, ...rest }: OutboundLinkProps) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>): void {
    onClick?.(event);
    if (event.defaultPrevented || !isDiscordActivity()) return;
    event.preventDefault();
    void openExternal(href);
  }

  return (
    <a {...rest} href={href} target="_blank" rel="noreferrer" onClick={handleClick}>
      {children}
    </a>
  );
}
