import { describe, expect, it } from "vitest";
import { isNotFoundError } from "../utils/isNotFoundError";
import { isDiffRetryable } from "../utils/isDiffRetryable";

describe("isNotFoundError", () => {
  it.each([404, 422])("is true for a %i", (status) => {
    expect(isNotFoundError({ status })).toBe(true);
  });

  it.each([[{ status: 500 }], [{ status: 401 }], [{ status: "FETCH_ERROR" }], [{ message: "x" }], [undefined], [null]])(
    "is false for %j: the recipe may well still exist",
    (error) => {
      expect(isNotFoundError(error)).toBe(false);
    },
  );
});

describe("isDiffRetryable", () => {
  it.each([[{ status: 500 }], [{ status: "FETCH_ERROR" }], [undefined]])("is true for %j", (error) => {
    expect(isDiffRetryable(error)).toBe(true);
  });

  it.each([400, 404, 422])("is false for a %i: asking again gets the same answer", (status) => {
    expect(isDiffRetryable({ status })).toBe(false);
  });
});
