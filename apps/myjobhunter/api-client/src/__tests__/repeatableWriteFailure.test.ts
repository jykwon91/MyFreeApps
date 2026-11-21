import { describe, expect, it, vi } from "vitest";
import { repeatableWriteFailure } from "../utils/repeatableWriteFailure";

const UNSURE = "I didn't get an answer, so I'm not sure that went through. Trying again is safe.";

describe("repeatableWriteFailure", () => {
  it("leaves a real refusal to the caller's wording", () => {
    expect(repeatableWriteFailure({ status: 400, data: { detail: "Bad" } }, () => "Couldn't save this posting")).toBe("Couldn't save this posting");
    expect(repeatableWriteFailure({ status: 503, data: { detail: "Storage unavailable" } }, () => "failed")).toBe("failed");
  });

  it.each([
    { status: "FETCH_ERROR" },
    { status: "TIMEOUT_ERROR" },
    { status: 502, data: "<html>Bad Gateway</html>" },
  ])("calls a lost answer (%j) unsure, without asking for the caller's wording", (error) => {
    const describe = vi.fn(() => "Couldn't save this posting");
    expect(repeatableWriteFailure(error, describe)).toBe(UNSURE);
    expect(describe).not.toHaveBeenCalled();
  });

  it("says nothing when a cache reset called it off", () => {
    expect(repeatableWriteFailure({ name: "AbortError", message: "Aborted" }, () => "failed")).toBeNull();
  });
});
