import type { FakeParams } from "./FakeParams";

export interface SentRequest {
  route: string;
  body: Record<string, unknown>;
  params: FakeParams;
  authorization: string | undefined;
  /** The X-Turnstile-Token header, for the forms behind the captcha. */
  turnstileToken: string | undefined;
  /** What was sent as-is, e.g. a FormData that `body` can't show. */
  data: unknown;
}
