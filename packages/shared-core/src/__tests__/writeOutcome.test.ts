import { describe, expect, it } from "vitest";
import { writeOutcome } from "../utils/writeOutcome";

describe("writeOutcome", () => {
  it("is unknown when no answer came back, since the request may have reached the server", () => {
    // The shared base query leaves the status out; RTK's own fetch names it.
    expect(writeOutcome({ status: undefined, data: "Network Error" })).toBe("unknown");
    expect(writeOutcome({ status: undefined, data: "timeout of 30000ms exceeded" })).toBe("unknown");
    expect(writeOutcome({ status: "FETCH_ERROR", error: "Failed to fetch" })).toBe("unknown");
    expect(writeOutcome({ status: "TIMEOUT_ERROR", error: "timeout" })).toBe("unknown");
    expect(writeOutcome(new Error("Network Error"))).toBe("unknown");
  });

  it("is unknown for a server or proxy failure that gives no reason", () => {
    expect(writeOutcome({ status: 500, data: "Internal Server Error" })).toBe("unknown");
    expect(writeOutcome({ status: 502, data: "<html>Bad Gateway</html>" })).toBe("unknown");
    expect(writeOutcome({ status: 504, data: undefined })).toBe("unknown");
    expect(writeOutcome({ status: 503, data: { detail: "" } })).toBe("unknown");
  });

  it("is not saved when the server refused on purpose with its own reason", () => {
    expect(writeOutcome({ status: 503, data: { detail: "Photo storage is not configured" } })).toBe("notSaved");
    expect(writeOutcome({ status: 502, data: { detail: "JD parsing failed" } })).toBe("notSaved");
  });

  it.each([400, 401, 403, 404, 409, 413, 422, 429])("is not saved for a %s, which the server answers before saving", (status) => {
    expect(writeOutcome({ status, data: undefined })).toBe("notSaved");
  });
});
