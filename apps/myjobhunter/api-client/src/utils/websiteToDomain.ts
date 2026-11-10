import type { UrlHostname } from "../types/application/url-hostname";

/**
 * Reduces a company website to its bare host (no scheme, no leading "www.", no trailing slash),
 * since Company.primary_domain is a domain, not a URL. Something `hostnameOf` can't parse has its
 * scheme, trailing slash and "www." stripped as text instead.
 */
export function websiteToDomain(website: string | null | undefined, hostnameOf: UrlHostname): string | null {
  if (!website) return null;
  try {
    let host = hostnameOf(website.trim()).toLowerCase();
    if (host.startsWith("www.")) host = host.slice(4);
    return host || null;
  } catch {
    const stripped = website.trim().replace(/^https?:\/\//i, "").replace(/\/$/, "");
    return stripped.replace(/^www\./i, "") || null;
  }
}
