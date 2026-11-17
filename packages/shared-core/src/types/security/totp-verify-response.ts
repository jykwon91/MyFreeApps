export interface TotpVerifyResponse {
  verified: boolean;
  recovery_codes: string[];
  /** The caller's new token. The API client switches to it before anyone sees this response. */
  access_token: string;
}
