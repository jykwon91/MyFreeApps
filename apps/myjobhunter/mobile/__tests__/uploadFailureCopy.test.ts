import { RATE_LIMITED_MESSAGES } from "@myjobhunter/api-client/constants/rateLimitedMessages";
import { DOCUMENT_MESSAGES } from "../src/constants/documents";
import { RESUME_MESSAGES } from "../src/constants/resume";
import { documentUploadFailure } from "../src/lib/documentUploadFailure";
import { resumeUploadFailure } from "../src/lib/resumeUploadFailure";
import { DOCUMENT_UPLOAD_PROBLEM_MESSAGES } from "@myjobhunter/api-client/constants/documentUploadProblemMessages";

const NO_ANSWER = [{ status: undefined, data: "Network Error" }, { status: "FETCH_ERROR" }, { status: "TIMEOUT_ERROR" }];

describe("resumeUploadFailure", () => {
  it.each(NO_ANSWER)("says the upload may have gone through when no answer came back (%j)", (error) => {
    expect(resumeUploadFailure(null, error)).toBe(
      "I lost the connection, so I'm not sure that saved. Check your uploaded resumes before trying again, so you don't end up with two.",
    );
  });

  it("says the upload may have gone through when the server broke without a reason", () => {
    expect(resumeUploadFailure(null, { status: 504, data: "Gateway Timeout" })).toBe(
      "I'm not sure that saved. Check your uploaded resumes before trying again, so you don't end up with two.",
    );
  });

  it("keeps its other wording", () => {
    expect(resumeUploadFailure(null, { status: 500, data: { detail: "Storage unavailable" } })).toBe(RESUME_MESSAGES.couldntUpload);
    expect(resumeUploadFailure(null, { status: 429 })).toBe(RATE_LIMITED_MESSAGES.resumeUpload);
    expect(resumeUploadFailure(null, { status: 413 })).toBe(RESUME_MESSAGES.tooLarge);
    expect(resumeUploadFailure("type")).toBe(RESUME_MESSAGES.badType);
  });
});

describe("documentUploadFailure", () => {
  it.each(NO_ANSWER)("says the upload may have gone through when no answer came back (%j)", (error) => {
    expect(documentUploadFailure(null, error)).toBe(
      "I lost the connection, so I'm not sure that saved. Check your documents before trying again, so you don't end up with two.",
    );
  });

  it("says the upload may have gone through when the server broke without a reason", () => {
    expect(documentUploadFailure(null, { status: 502, data: "Bad Gateway" })).toBe(
      "I'm not sure that saved. Check your documents before trying again, so you don't end up with two.",
    );
  });

  it("keeps its other wording", () => {
    expect(documentUploadFailure(null, { status: 500, data: { detail: "Storage unavailable" } })).toBe(DOCUMENT_MESSAGES.couldntUpload);
    expect(documentUploadFailure(null, { status: 415 })).toBe(DOCUMENT_UPLOAD_PROBLEM_MESSAGES.type);
    expect(documentUploadFailure("empty")).toBe(DOCUMENT_UPLOAD_PROBLEM_MESSAGES.empty);
  });
});
