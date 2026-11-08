const STATIC_ROUTE_PATH = /^(\/[a-z0-9][a-z0-9-]*)+$/;

/**
 * The bundle file a route's pre-rendered HTML is written to: `/wow-forever/map` -> `wow-forever/map/index.html`.
 * Caddy serves it for `/wow-forever/map` via `try_files {path} {path}/index.html /index.html`.
 *
 * Throws on anything but a plain static path (params, wildcards, trailing slashes, `..`), so a typo in a
 * route config fails the build instead of shipping a file no URL reaches.
 */
export function routeHtmlFileName(path: string): string {
  if (!STATIC_ROUTE_PATH.test(path)) {
    throw new Error(
      `Link preview route "${path}" must be a static path like "/games/map" ` +
        "(lowercase, leading slash, no trailing slash, no params).",
    );
  }
  return `${path.slice(1)}/index.html`;
}
