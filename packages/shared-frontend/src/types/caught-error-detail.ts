/** The `detail` of a CAUGHT_ERROR_EVENT: which boundary caught it, and the error. */
export interface CaughtErrorDetail {
  source: string;
  name: string;
  message: string;
  stack: string;
}
