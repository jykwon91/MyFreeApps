/**
 * How long any request may take when it names no timeout of its own. A phone has no
 * limit of its own, so a dead or captive-portal connection would otherwise leave a
 * screen loading forever. Ordinary reads and writes answer in well under a second;
 * this leaves room for a slow connection and a busy server.
 */
export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

/**
 * A request the server answers by asking a model, or that sends a file and then has
 * a model read it. A model can take minutes on a long document.
 */
export const MODEL_REQUEST_TIMEOUT_MS = 5 * 60_000;

/**
 * Sending a file. The proxy allows two minutes for the body to arrive, and a phone
 * connection then still has to wait for the server to store it.
 */
export const UPLOAD_REQUEST_TIMEOUT_MS = 5 * 60_000;

/** Building and fetching a whole-account export or generated document. */
export const EXPORT_REQUEST_TIMEOUT_MS = 2 * 60_000;

/** Clearing years of records takes a while, and giving up early leaves the answer unknown. */
export const DELETE_ACCOUNT_TIMEOUT_MS = 60_000;

/**
 * Downloading a file straight to the phone, outside the API client. The server may build a report
 * before the first byte, and the whole file still has to arrive over a phone connection.
 */
export const FILE_DOWNLOAD_TIMEOUT_MS = 2 * 60_000;
