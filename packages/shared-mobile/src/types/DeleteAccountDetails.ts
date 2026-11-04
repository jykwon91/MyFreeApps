export interface DeleteAccountDetails {
  email: string;
  password: string;
  /** Null when two-factor isn't on. */
  code: string | null;
}
