import type { RegisterFailure } from "./RegisterFailure";

export type RegisterResult =
  | { outcome: "registered" }
  /** The server's own reason, such as a too-short password or one seen in a data breach. */
  | { outcome: "weakPassword"; reason: string }
  | { outcome: "failed"; failure: RegisterFailure };
