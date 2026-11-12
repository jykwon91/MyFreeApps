import { describe, expect, it } from "vitest";
import { photoImportErrorMessage } from "../utils/photoImportErrorMessage";
import { requestErrorStatus } from "../utils/requestErrorStatus";

describe("photoImportErrorMessage", () => {
  it("tells a photo it can't read from a service that's down, a limit, or a dropped connection", () => {
    expect(photoImportErrorMessage({ status: 413 })).toBe("That photo is too large (max 15 MB). Try a smaller or compressed version.");
    expect(photoImportErrorMessage({ status: 415 })).toMatch(/JPG, PNG or WebP/);
    expect(photoImportErrorMessage({ status: 422 })).toMatch(/clearer or better-lit photo/);
    expect(photoImportErrorMessage({ status: 429 })).toMatch(/Give it a few minutes/);
    expect(photoImportErrorMessage({ status: 503 })).toBe("Photo import isn't available right now.");
    expect(photoImportErrorMessage({ status: 500 })).toBe("Something went wrong — please try again.");
    expect(photoImportErrorMessage(new Error("Network Error"))).toBe("Something went wrong — please try again.");
  });
});

describe("requestErrorStatus", () => {
  it("reads a numeric status and nothing else", () => {
    expect(requestErrorStatus({ status: 429 })).toBe(429);
    expect(requestErrorStatus({ status: "FETCH_ERROR" })).toBeUndefined();
    expect(requestErrorStatus(null)).toBeUndefined();
    expect(requestErrorStatus("boom")).toBeUndefined();
  });
});
