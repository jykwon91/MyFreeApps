import { MB } from "./byteUnits";

/**
 * Caddy's ``request_body max_size 30MB`` (``docker/Caddyfile.docker``): a bigger request is refused
 * before the app sees it, with no message. Caddy reads ``MB`` as decimal, so this is 30,000,000 bytes,
 * not 30 MiB; counting it in MiB would let a file of about 28.6 to 29 MiB past the check and into a 413.
 */
export const REQUEST_BODY_MAX_BYTES = 30 * MB;

/** Room under that ceiling for the multipart boundaries and the other form fields. */
export const REQUEST_OVERHEAD_BYTES = MB;
