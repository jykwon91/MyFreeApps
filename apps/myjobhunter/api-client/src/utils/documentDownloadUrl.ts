import { safeLinkUrl } from "@platform/core/utils/safeLinkUrl";

/**
 * The file's download link when it's http or https, or null so nothing opens. The link comes from
 * the server's storage presigner, but a `javascript:` or app link must never reach the browser.
 */
export function documentDownloadUrl({ url }: { url: string }): string | null {
  return safeLinkUrl(url, ["http", "https"]);
}
