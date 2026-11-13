/** A JSON answer for page.route() in no-backend (fully mocked) E2E specs. For E2E tests only. */
import type { JsonFulfillment } from "./types/JsonFulfillment";

export const json = (body: unknown, status = 200): JsonFulfillment => ({
  status,
  contentType: "application/json",
  body: JSON.stringify(body),
});
