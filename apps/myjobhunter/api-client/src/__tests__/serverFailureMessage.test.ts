import { describe, expect, it } from "vitest";
import { serverFailureMessage } from "../utils/serverFailureMessage";

describe("serverFailureMessage", () => {
  it("is the server's reason when it gave one as text", () => {
    expect(serverFailureMessage({ status: 422, data: { detail: " Not allowed. " } }, "fallback")).toBe("Not allowed.");
  });

  it.each([
    ["no detail", { status: 500, data: {} }],
    ["a blank detail", { status: 500, data: { detail: "  " } }],
    ["a detail that isn't text", { status: 422, data: { detail: [{ msg: "bad" }] } }],
    ["no answer", new Error("Network Error")],
  ])("is the fallback with %s", (_label, error) => {
    expect(serverFailureMessage(error, "fallback")).toBe("fallback");
  });
});
