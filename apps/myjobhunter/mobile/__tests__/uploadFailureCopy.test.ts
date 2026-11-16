import { RATE_LIMITED_MESSAGES } from "@myjobhunter/api-client/constants/rateLimitedMessages";
import { DOCUMENT_MESSAGES } from "../src/constants/documents";
import { RESUME_MESSAGES } from "../src/constants/resume";
import { documentUploadFailure } from "../src/lib/documentUploadFailure";
import { resumeUploadFailure } from "../src/lib/resumeUploadFailure";

const NO_ANSWER = [{ status: undefined, data: "Network Error" }, { status: "FETCH_ERROR" }, { status: "TIMEOUT_ERROR" }];

describe("resumeUploadFailure", () => {
  it.each(NO_ANSWER)("says the server can't be reached when no answer came back (%j)", (error) => {
    expect(resumeUploadFailure(null, error)).toBe(RESUME_MESSAGES.couldntReachServer);
  });

  it("keeps its other wording", () => {
    expect(resumeUploadFailure(null, { status: 500 })).toBe(RESUME_MESSAGES.couldntUpload);
    expect(resumeUploadFailure(null, { status: 429 })).toBe(RATE_LIMITED_MESSAGES.resumeUpload);
    expect(resumeUploadFailure(null, { status: 413 })).toBe(RESUME_MESSAGES.tooLarge);
    expect(resumeUploadFailure("type")).toBe(RESUME_MESSAGES.badType);
  });
});

describe("documentUploadFailure", () => {
  it.each(NO_ANSWER)("says the server can't be reached when no answer came back (%j)", (error) => {
    expect(documentUploadFailure(null, error)).toBe(DOCUMENT_MESSAGES.couldntReachServer);
  });

  it("keeps its other wording", () => {
    expect(documentUploadFailure(null, { status: 500 })).toBe(DOCUMENT_MESSAGES.couldntUpload);
    expect(documentUploadFailure(null, { status: 415 })).toBe(DOCUMENT_MESSAGES.badType);
    expect(documentUploadFailure("empty")).toBe(DOCUMENT_MESSAGES.emptyFile);
  });
});
