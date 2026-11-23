import { describe, expect, it } from "vitest";
import { CONNECTION_MESSAGES } from "../constants/connectionCopy";
import { photoImportErrorMessage } from "../utils/photoImportErrorMessage";
import { photoImportProblemIsThePhoto } from "../utils/photoImportProblemIsThePhoto";
import { requestErrorStatus } from "../utils/requestErrorStatus";

describe("photoImportErrorMessage", () => {
  it("tells a photo it can't read from a service that's down, a limit, or a dropped connection", () => {
    expect(photoImportErrorMessage({ status: 413 })).toBe("That photo is too large (max 15 MB and 80 megapixels). Try a smaller or compressed version.");
    expect(photoImportErrorMessage({ status: 415 })).toMatch(/JPG, PNG or WebP/);
    expect(photoImportErrorMessage({ status: 422 })).toMatch(/clearer or better-lit photo/);
    expect(photoImportErrorMessage({ status: 429 })).toMatch(/Give it a few minutes/);
    expect(photoImportErrorMessage({ status: 503 })).toBe("Photo import isn't available right now.");
    expect(photoImportErrorMessage({ status: 500 })).toBe("Something went wrong — please try again.");
    expect(photoImportErrorMessage(new Error("boom"))).toBe("Something went wrong — please try again.");
  });

  it("says the server can't be reached when no answer came back", () => {
    expect(photoImportErrorMessage({ status: undefined })).toBe(CONNECTION_MESSAGES.photoImport);
    expect(photoImportErrorMessage({ status: "FETCH_ERROR" })).toBe(CONNECTION_MESSAGES.photoImport);
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

describe("photoImportProblemIsThePhoto", () => {
  it("blames the photo for a size limit, a wrong type, or no recipe in it", () => {
    for (const status of [413, 415, 422]) expect(photoImportProblemIsThePhoto({ status })).toBe(true);
  });

  it("keeps the photo when the service is busy, down, failing or unreachable", () => {
    for (const status of [429, 500, 503]) expect(photoImportProblemIsThePhoto({ status })).toBe(false);
    expect(photoImportProblemIsThePhoto({ status: "FETCH_ERROR" })).toBe(false);
    expect(photoImportProblemIsThePhoto(new Error("boom"))).toBe(false);
  });
});
