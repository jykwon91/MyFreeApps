import { describe, expect, it } from "vitest";
import { DOCUMENT_STATUS_OPTIONS, DOCUMENT_SOURCE_OPTIONS } from "../constants/documentFilterOptions";
import { REFERENCE_ONLY_COPY } from "../constants/documentReferenceOnly";
import { documentSourceLabel } from "../utils/documentSourceLabel";
import { failedDocumentsMessage } from "../utils/failedDocumentsMessage";

describe("document copy", () => {
  it("names the failed documents, or counts them", () => {
    expect(failedDocumentsMessage(1, "bad.pdf")).toBe("I had trouble with bad.pdf. Want me to try again?");
    expect(failedDocumentsMessage(3, "bad.pdf")).toBe("I had trouble with 3 documents. Want to take a look?");
  });

  it("labels a source the same wherever it is shown or chosen", () => {
    expect(documentSourceLabel("email")).toBe("Email");
    expect(documentSourceLabel("upload")).toBe("Upload");
    expect(DOCUMENT_SOURCE_OPTIONS.map((option) => option.label)).toEqual(["Upload", "Email"]);
  });

  it("offers every status a listed document can have, including skipped", () => {
    expect(DOCUMENT_STATUS_OPTIONS.map((option) => option.value)).toEqual(["completed", "failed", "duplicate", "processing", "extracting", "skipped"]);
    expect(DOCUMENT_STATUS_OPTIONS.find((option) => option.value === "skipped")?.label).toBe("Skipped");
  });

  it("warns that marking reference-only removes approved and edited transactions for good", () => {
    expect(REFERENCE_ONLY_COPY.confirmBody).toMatch(/every transaction pulled from it, including ones you've approved or edited/);
    expect(REFERENCE_ONLY_COPY.confirmBody).toMatch(/unmarking it later won't bring them back/);
    expect(REFERENCE_ONLY_COPY.unmarked).toMatch(/stay removed/);
  });
});
