/**
 * Login credentials returned ONCE at demo-account creation time.
 *
 * The backend never persists the plaintext password — it's hashed by
 * fastapi-users immediately. The frontend surfaces this object in a
 * one-time modal with a copy button; if the operator dismisses that
 * modal without copying, the only recovery is to delete + recreate.
 */
export interface DemoCredentials {
  email: string;
  password: string;
}
