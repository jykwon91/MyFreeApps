import { withoutDiscordLaunchParams } from "./launchParams";

/** An in-app location — react-router's `Location` fits. */
export interface SiteLocation {
  pathname: string;
  search?: string;
  hash?: string;
}

/**
 * The real website's URL for an in-app location, e.g. for an "Open in
 * browser" button inside a Discord Activity. Discord's launch parameters are
 * dropped (the website must never think it is inside Discord), and the URL is
 * assembled with URL setters so no pathname — not even `//elsewhere.example`
 * — can change the host. `siteUrl` is the site's origin.
 */
export function buildSiteUrl(siteUrl: string, location: SiteLocation): string {
  const url = new URL(siteUrl);
  url.pathname = location.pathname;
  url.search = withoutDiscordLaunchParams(location.search ?? "");
  url.hash = location.hash ?? "";
  return url.toString();
}
