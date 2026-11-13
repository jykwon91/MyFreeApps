/** Answers for page.route() in no-backend (fully mocked) E2E specs. For E2E tests only. */
import type { JsonFulfillment } from "./types/JsonFulfillment";
import type { TextFulfillment } from "./types/TextFulfillment";

export const json = (body: unknown, status = 200): JsonFulfillment => ({
  status,
  contentType: "application/json",
  body: JSON.stringify(body),
});

/** A plain-text answer, e.g. Starlette's "Internal Server Error" for an unhandled 500. */
export const plainText = (body: string, status = 200): TextFulfillment => ({
  status,
  contentType: "text/plain; charset=utf-8",
  body,
});
