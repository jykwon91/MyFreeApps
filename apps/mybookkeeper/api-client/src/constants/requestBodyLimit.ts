export const MEGABYTE = 1024 * 1024;

/** Caddy's ``request_body max_size`` (``docker/Caddyfile.docker``): a bigger request is refused before the app sees it, with no message. */
export const REQUEST_BODY_MAX_BYTES = 30 * MEGABYTE;

/** Room under that ceiling for the multipart boundaries and the other form fields. */
export const REQUEST_OVERHEAD_BYTES = MEGABYTE;
