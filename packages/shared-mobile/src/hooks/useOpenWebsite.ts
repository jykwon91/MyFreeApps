import type { WebPath } from "../types/WebPath";
import { useOpenLink } from "./useOpenLink";

/** Opens a page of the app's website, such as ("https://example.org", "/settings"). */
export function useOpenWebsite(): (webBaseUrl: string, path: WebPath) => Promise<void> {
  const openLink = useOpenLink();
  return (webBaseUrl, path) => openLink(`${webBaseUrl}${path}`);
}
