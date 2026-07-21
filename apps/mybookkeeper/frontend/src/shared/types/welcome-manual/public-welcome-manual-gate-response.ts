/**
 * Response from the public gate check (``GET /public/welcome-manuals/:token``).
 * A 404 (unknown/revoked token) is handled as a request failure, not a value
 * of this type — every successful response requires a PIN.
 */
export interface PublicWelcomeManualGateResponse {
  requires_pin: true;
}
