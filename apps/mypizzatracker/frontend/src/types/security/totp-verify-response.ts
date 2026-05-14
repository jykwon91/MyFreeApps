export interface TotpVerifyResponse {
  verified: boolean;
  recovery_codes: string[];
}
