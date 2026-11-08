import type { Plugin } from "vite";
import { SPA_ENTRY_FILE_NAME } from "./constants";
import { renderLinkPreviewHtml } from "./renderLinkPreviewHtml";
import { routeHtmlFileName } from "./routeHtmlFileName";
import type { LinkPreviewConfig } from "./types/LinkPreviewConfig";

const HTTPS_ORIGIN = /^https:\/\/[^/\s]+$/;
const SITE_RELATIVE_PATH = /^\/[^/\s]/;

function validateConfig(config: LinkPreviewConfig): void {
  if (!HTTPS_ORIGIN.test(config.site.origin)) {
    throw new Error(`Link preview site origin "${config.site.origin}" must be https://<host> with no trailing slash.`);
  }
  const seen = new Set<string>();
  for (const page of [config.root, ...config.routes]) {
    if (!SITE_RELATIVE_PATH.test(page.image)) {
      throw new Error(`Link preview image "${page.image}" must be a site-relative path like "/link-preview/app.png".`);
    }
  }
  for (const route of config.routes) {
    if (seen.has(route.path)) throw new Error(`Link preview route "${route.path}" is listed twice.`);
    seen.add(route.path);
  }
}

/**
 * Link previews for a client-rendered SPA. Discord, Slack and other unfurlers don't run JavaScript, so a
 * page's title, description and image must be in the HTML the server sends.
 *
 * At build time this writes the root tags into `index.html` and, for every listed route, a copy of it at
 * `dist/<route>/index.html` carrying that route's tags. The app's Caddyfile serves those with
 * `try_files {path} {path}/index.html /index.html`; unlisted routes still get the root `index.html`.
 */
export function linkPreviewPlugin(config: LinkPreviewConfig): Plugin {
  validateConfig(config);
  const files = config.routes.map((route) => ({ route, fileName: routeHtmlFileName(route.path) }));

  return {
    name: "platform:link-preview",
    apply: "build",
    enforce: "post",
    generateBundle(_options, bundle) {
      const entry = bundle[SPA_ENTRY_FILE_NAME];
      if (!entry || entry.type !== "asset" || typeof entry.source !== "string") {
        this.error(`Link preview: no ${SPA_ENTRY_FILE_NAME} in the build output.`);
      }
      const built = entry.source;
      entry.source = renderLinkPreviewHtml(built, config.root, config.site, "/");
      for (const { route, fileName } of files) {
        this.emitFile({
          type: "asset",
          fileName,
          source: renderLinkPreviewHtml(built, route, config.site, route.path),
        });
      }
    },
  };
}
