import type { DemoCredentials } from "@/types/demo/demo-credentials";

/**
 * Response of a successful `POST /admin/demo/users` (HTTP 201).
 *
 * The `credentials` field is shown ONCE — there is no recovery path
 * for the plaintext password if the operator dismisses the modal.
 */
export interface DemoCreateResponse {
  message: string;
  credentials: DemoCredentials;
  user_id: string;
}
