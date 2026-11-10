import { describe, expect, it } from "vitest";
import { DOCUMENT_UPLOAD_MAX_BYTES } from "../constants/documentUploadLimits";
import { documentUploadProblem } from "../utils/documentUploadProblem";

describe("documentUploadProblem", () => {
  it("accepts a PDF, a Word document or plain text up to the limit", () => {
    expect(documentUploadProblem({ mimeType: "application/pdf", size: DOCUMENT_UPLOAD_MAX_BYTES })).toBeNull();
    expect(documentUploadProblem({ mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: 10 })).toBeNull();
    expect(documentUploadProblem({ mimeType: "text/plain" })).toBeNull();
  });

  it("refuses other types, whatever their size", () => {
    expect(documentUploadProblem({ mimeType: "image/png", size: 10 })).toBe("type");
    expect(documentUploadProblem({ mimeType: "application/msword", size: DOCUMENT_UPLOAD_MAX_BYTES + 1 })).toBe("type");
  });

  it("refuses an empty file", () => {
    expect(documentUploadProblem({ mimeType: "application/pdf", size: 0 })).toBe("empty");
  });

  it("refuses a file over the limit", () => {
    expect(documentUploadProblem({ mimeType: "application/pdf", size: DOCUMENT_UPLOAD_MAX_BYTES + 1 })).toBe("size");
  });
});
