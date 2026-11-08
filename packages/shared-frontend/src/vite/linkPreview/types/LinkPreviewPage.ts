/** The link-preview tags of one page: what Discord, Slack and other unfurlers show for its URL. */
export interface LinkPreviewPage {
  /** `<title>`, `og:title` and `twitter:title`. */
  readonly title: string;
  /** `<meta name="description">`, `og:description` and `twitter:description`. */
  readonly description: string;
  /** Site-relative path of a 1200x630 image in the app's `public/` folder, e.g. `/link-preview/app.png`. */
  readonly image: string;
  /** Absolute URL for `og:url` and `<link rel="canonical">`; defaults to the site origin + the route path. */
  readonly canonical?: string;
}
