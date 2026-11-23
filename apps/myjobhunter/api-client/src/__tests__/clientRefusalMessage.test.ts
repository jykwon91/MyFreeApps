import { describe, expect, it } from "vitest";
import { clientRefusalMessage } from "../utils/clientRefusalMessage";

describe("clientRefusalMessage", () => {
  it("is the server's reason when it turned the request down with one", () => {
    expect(clientRefusalMessage({ status: 422, data: { detail: "Not allowed." } }, "fallback")).toBe("Not allowed.");
  });

  it.each([
    ["a 4xx with no detail", { status: 400, data: {} }],
    ["a 4xx with a detail that isn't text", { status: 422, data: { detail: [{ msg: "bad" }] } }],
    ["a 5xx with a detail", { status: 502, data: { detail: "Traceback: KeyError 'x'" } }],
    ["a 5xx page", { status: 502, data: "<html>Bad Gateway</html>" }],
    ["no answer", { status: "FETCH_ERROR" }],
  ])("is the fallback with %s", (_label, error) => {
    expect(clientRefusalMessage(error, "fallback")).toBe("fallback");
  });
});
