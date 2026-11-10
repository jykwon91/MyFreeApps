/** The body of a successful /auth/mobile/login or /auth/mobile/refresh. */
export interface FakeTokens {
  access_token: string;
  refresh_token: string;
  session_id: string;
}
