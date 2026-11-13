import { describe, expect, it } from "vitest";
import { describeRouteError } from "../utils/describeRouteError";

// The shape react-router's isRouteErrorResponse recognises (an ErrorResponse).
const NOT_FOUND = { status: 404, statusText: "Not Found", internal: true, data: "No route matches URL" };

describe("describeRouteError", () => {
  it("describes a route Response by its status", () => {
    expect(describeRouteError(NOT_FOUND)).toBe("404 Not Found");
  });

  it("describes an Error by its message", () => {
    expect(describeRouteError(new TypeError("Cannot read properties of undefined"))).toBe(
      "Cannot read properties of undefined",
    );
  });

  it("falls back for anything else", () => {
    expect(describeRouteError("plain string")).toBe("Unknown error");
  });
});
