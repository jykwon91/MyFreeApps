import { describe, expect, it } from "vitest";
import { DOCUMENT_KIND_LABELS } from "../constants/documentKindLabels";
import { DOCUMENT_KIND_TONES } from "../constants/documentKindTones";
import type { DocumentKind } from "../types/document/document-kind";
import { documentKindLabel, documentKindTone } from "../utils/documentKind";

describe("documentKindLabel and documentKindTone", () => {
  it("name and colour every kind the app knows", () => {
    for (const kind of Object.keys(DOCUMENT_KIND_LABELS) as DocumentKind[]) {
      expect(documentKindLabel(kind)).toBe(DOCUMENT_KIND_LABELS[kind]);
      expect(documentKindTone(kind)).toBe(DOCUMENT_KIND_TONES[kind]);
    }
    expect(documentKindLabel("tailored_resume")).toBe("Tailored Resume");
    expect(documentKindTone("cover_letter")).toBe("info");
  });

  it("show a kind added on the backend after this build as sent, in a neutral badge", () => {
    expect(documentKindLabel("reference_letter")).toBe("reference_letter");
    expect(documentKindTone("reference_letter")).toBe("neutral");
  });

  it("don't mistake an object property for a kind", () => {
    expect(documentKindLabel("toString")).toBe("toString");
    expect(documentKindTone("constructor")).toBe("neutral");
  });
});
