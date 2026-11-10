import { describe, expect, it } from "vitest";
import { uploadRejection } from "../utils/uploadRejection";

describe("uploadRejection", () => {
  it("reads a 413 as too large", () => {
    expect(uploadRejection({ status: 413, data: { detail: "file exceeds 25MB limit" } })).toBe("size");
  });

  it("reads the server's empty-file 415 as empty, and any other 415 as the wrong type", () => {
    expect(uploadRejection({ status: 415, data: { detail: "empty file" } })).toBe("empty");
    expect(uploadRejection({ status: 415, data: { detail: "unsupported file type" } })).toBe("type");
    expect(uploadRejection({ status: 415, data: "Unsupported" })).toBe("type");
  });

  it("leaves every other failure to the caller", () => {
    expect(uploadRejection({ status: 500, data: {} })).toBeNull();
    expect(uploadRejection({ status: undefined, data: "Network Error" })).toBeNull();
    expect(uploadRejection(new Error("boom"))).toBeNull();
  });
});
