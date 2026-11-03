/** Body of `POST /auth/totp/login`. */
export interface LoginResponse {
  access_token?: string;
  token_type?: string;
  detail?: string;
}
