import type { InternalAxiosRequestConfig } from "axios";

export interface SessionRetryConfig extends InternalAxiosRequestConfig {
  /** The token this client attached. Undefined when the caller set its own Authorization. */
  _sentToken?: string | null;
  _sessionRetried?: boolean;
}
