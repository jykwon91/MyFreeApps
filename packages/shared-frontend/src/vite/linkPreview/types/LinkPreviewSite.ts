/** Site-wide link-preview settings shared by every page of one app. */
export interface LinkPreviewSite {
  /** `og:site_name`, e.g. `MyGamingAssistant`. */
  readonly name: string;
  /** Public origin the absolute URLs are built on, with no trailing slash, e.g. `https://example.org`. */
  readonly origin: string;
}
