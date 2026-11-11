import { describe, expect, it } from "vitest";
import { RESUME_UPLOAD_MAX_BYTES } from "../constants/resumeUploadLimits";
import { resumeJobsInFlight } from "../utils/resumeJobsInFlight";
import { resumeUploadProblem } from "../utils/resumeUploadProblem";
import { uploadProblem } from "../utils/uploadProblem";
import { resumeUploadJob } from "./support/resumeUploadJob";

describe("resumeUploadProblem", () => {
  it("accepts a PDF, a Word document or plain text up to 25 MB", () => {
    expect(resumeUploadProblem({ mimeType: "application/pdf", size: RESUME_UPLOAD_MAX_BYTES })).toBeNull();
    expect(resumeUploadProblem({ mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: 10 })).toBeNull();
    expect(resumeUploadProblem({ mimeType: "text/plain", size: null })).toBeNull();
  });

  it("refuses other types, an empty file, and one over the limit", () => {
    expect(resumeUploadProblem({ mimeType: "image/png", size: 10 })).toBe("type");
    expect(resumeUploadProblem({ mimeType: "application/msword", size: 10 })).toBe("type");
    expect(resumeUploadProblem({ mimeType: "application/pdf", size: 0 })).toBe("empty");
    expect(resumeUploadProblem({ mimeType: "application/pdf", size: RESUME_UPLOAD_MAX_BYTES + 1 })).toBe("size");
  });
});

describe("uploadProblem", () => {
  it("checks the type before the size, against the limits it's given", () => {
    const limits = { mimeTypes: ["text/plain"], maxBytes: 5 };
    expect(uploadProblem({ mimeType: "text/plain", size: 5 }, limits)).toBeNull();
    expect(uploadProblem({ mimeType: "text/plain", size: 6 }, limits)).toBe("size");
    expect(uploadProblem({ mimeType: "application/pdf", size: 6 }, limits)).toBe("type");
  });
});

describe("resumeJobsInFlight", () => {
  it("keeps the uploads still queued or being read, in order", () => {
    const jobs = [
      resumeUploadJob({ id: "a", status: "processing" }),
      resumeUploadJob({ id: "b" }),
      resumeUploadJob({ id: "c", status: "queued" }),
      resumeUploadJob({ id: "d", status: "failed" }),
      resumeUploadJob({ id: "e", status: "cancelled" }),
    ];
    expect(resumeJobsInFlight(jobs).map(({ id }) => id)).toEqual(["a", "c"]);
    expect(resumeJobsInFlight([])).toEqual([]);
  });
});
