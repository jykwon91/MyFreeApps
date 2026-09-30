/**
 * The turn was refused before the stream opened (HTTP 4xx/5xx), or the
 * connection failed. ``detail`` is the backend's error code when it sent one
 * (e.g. ``daily_limit_reached``, ``tutor_unavailable``, ``session_ended``).
 */
export class TurnRequestError extends Error {
  readonly status: number;
  readonly detail: string;

  constructor(status: number, detail: string) {
    super(`turn request failed: ${status} ${detail}`);
    this.name = "TurnRequestError";
    this.status = status;
    this.detail = detail;
  }
}

/** ``status`` used when the network failed before any HTTP response. */
export const NETWORK_ERROR_STATUS = 0;
