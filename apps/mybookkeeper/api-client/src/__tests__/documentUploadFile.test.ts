import { describe, expect, it } from "vitest";
import {
  DOCUMENT_UPLOAD_ACCEPT,
  DOCUMENT_UPLOAD_MAX_BYTES,
  DOCUMENT_UPLOAD_MAX_LABEL,
  DOCUMENT_UPLOAD_MIME_TYPES,
} from "../constants/documentUpload";
import { LEASE_TEMPLATE_FILES_TOTAL_MAX_BYTES } from "../constants/leaseTemplateUpload";
import {
  documentUploadProblem,
  documentUploadProblemMessage,
  fileExtension,
  isSupportedDocumentUpload,
} from "../utils/documentUploadFile";

describe("the document upload allowlist", () => {
  it("offers a file input exactly the types the server reads", () => {
    expect(DOCUMENT_UPLOAD_ACCEPT).toBe(".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.csv,.zip");
  });

  it("lists each type once for a picker that filters by type", () => {
    expect(DOCUMENT_UPLOAD_MIME_TYPES).toEqual([
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/csv",
      "application/zip",
    ]);
  });

  it.each(["scan.pdf", "IMG.JPG", "photo.jpeg", "a.png", "a.webp", "old.doc", "lease.docx", "old.xls", "ledger.xlsx", "bank.csv", "receipts.zip"])(
    "takes %s",
    (name) => {
      expect(isSupportedDocumentUpload(name)).toBe(true);
    },
  );

  it.each(["notes.txt", "photo.heic", "movie.mov", "archive.tar.gz", "no-extension", "pdf"])("turns away %s", (name) => {
    expect(isSupportedDocumentUpload(name)).toBe(false);
  });

  it("reads the last extension, lower case", () => {
    expect(fileExtension("Q1.Statement.XLSX")).toBe(".xlsx");
    expect(fileExtension("README")).toBe("");
  });
});

describe("the document upload size limit", () => {
  it("is the proxy's 30 MB request ceiling less room for the form, not the server's own 100 MB", () => {
    expect(DOCUMENT_UPLOAD_MAX_BYTES).toBe(29_000_000);
    expect(DOCUMENT_UPLOAD_MAX_LABEL).toBe("29 MB");
  });

  it("matches what a lease template bundle may come to, since both meet the same ceiling", () => {
    expect(DOCUMENT_UPLOAD_MAX_BYTES).toBe(LEASE_TEMPLATE_FILES_TOTAL_MAX_BYTES);
  });
});

describe("documentUploadProblem", () => {
  it("lets a file through at exactly the limit", () => {
    expect(documentUploadProblem("big.zip", DOCUMENT_UPLOAD_MAX_BYTES)).toBeNull();
  });

  it("turns away a file one byte over", () => {
    expect(documentUploadProblem("big.zip", DOCUMENT_UPLOAD_MAX_BYTES + 1)).toBe("tooBig");
  });

  it("turns away an empty file", () => {
    expect(documentUploadProblem("blank.csv", 0)).toBe("empty");
  });

  it("leaves a size the picker didn't know to the server", () => {
    expect(documentUploadProblem("lease.docx", undefined)).toBeNull();
    expect(documentUploadProblem("notes.txt", undefined)).toBe("unsupported");
  });

  it("names the type before the size, since a smaller copy wouldn't help", () => {
    expect(documentUploadProblem("huge.mov", DOCUMENT_UPLOAD_MAX_BYTES + 1)).toBe("unsupported");
  });
});

describe("documentUploadProblemMessage", () => {
  it("says which file and what it takes instead", () => {
    expect(documentUploadProblemMessage("notes.txt", "unsupported")).toBe(
      "I can't read notes.txt. I take PDFs, photos (JPG, PNG, WEBP), Word, Excel, CSV and zip files.",
    );
  });

  it("says how big a file may be", () => {
    expect(documentUploadProblemMessage("scans.zip", "tooBig")).toBe(
      "scans.zip is over 29 MB, which is more than I can take. Try a smaller file, or split it up.",
    );
  });

  it("says an empty file has nothing to read", () => {
    expect(documentUploadProblemMessage("blank.csv", "empty")).toBe("blank.csv is empty, so there's nothing for me to read.");
  });
});
