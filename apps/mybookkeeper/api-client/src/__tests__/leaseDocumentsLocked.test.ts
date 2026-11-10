import { describe, expect, it } from "vitest";
import { LEASE_ATTACHMENT_LOCKED_CODE, LEASE_DOCUMENTS_LOCKED_CODE, LEASE_VALUE_LOCKED_CODE } from "../constants/leaseDocumentsLocked";
import { LEASE_ATTACHMENT_KINDS } from "../types/lease/lease-attachment-kind";
import { inferKindFromFilename, inferKindsForFiles } from "../utils/inferAttachmentKind";
import { isLeaseAttachmentLockedFailure } from "../utils/isLeaseAttachmentLockedFailure";
import { isLeaseDocumentsLockedFailure } from "../utils/isLeaseDocumentsLockedFailure";
import { isLeaseValueLockedFailure } from "../utils/isLeaseValueLockedFailure";

describe("the refusal codes", () => {
  it("recognises a refused regenerate by its code, not by the wording", () => {
    expect(isLeaseDocumentsLockedFailure({ status: 409, data: { detail: { code: LEASE_DOCUMENTS_LOCKED_CODE, message: "anything" } } })).toBe(true);
  });

  it("leaves other conflicts and other failures alone", () => {
    expect(isLeaseDocumentsLockedFailure({ status: 409, data: { detail: "This lease changed while I was generating." } })).toBe(false);
    expect(isLeaseDocumentsLockedFailure({ status: 500, data: { detail: { code: LEASE_DOCUMENTS_LOCKED_CODE } } })).toBe(false);
    expect(isLeaseDocumentsLockedFailure(undefined)).toBe(false);
  });

  it("recognises a refused delete, relabel or upload separately", () => {
    const error = { status: 409, data: { detail: { code: LEASE_ATTACHMENT_LOCKED_CODE } } };
    expect(isLeaseAttachmentLockedFailure(error)).toBe(true);
    expect(isLeaseDocumentsLockedFailure(error)).toBe(false);
  });
});

describe("a refused value change", () => {
  it("is recognised by its 422 code and by nothing else", () => {
    expect(isLeaseValueLockedFailure({ status: 422, data: { detail: { code: LEASE_VALUE_LOCKED_CODE, keys: ["RENT"] } } })).toBe(true);
    expect(isLeaseValueLockedFailure({ status: 422, data: { detail: "A required value is missing." } })).toBe(false);
    expect(isLeaseValueLockedFailure({ status: 409, data: { detail: { code: LEASE_VALUE_LOCKED_CODE } } })).toBe(false);
    expect(isLeaseValueLockedFailure({ status: 409, data: { detail: { code: LEASE_ATTACHMENT_LOCKED_CODE } } })).toBe(false);
    expect(isLeaseValueLockedFailure(undefined)).toBe(false);
  });
});

describe("guessing a kind from file names", () => {
  it("never offers a rendered original, which only the app makes", () => {
    const names = ["Lease Agreement.pdf", "move-in inspection.pdf", "insurance.pdf", "rendered_original.pdf", "original lease.pdf", "x.pdf"];
    expect(names.map(inferKindFromFilename)).not.toContain("rendered_original");
    expect(inferKindsForFiles(names)).not.toContain("rendered_original");
    expect(LEASE_ATTACHMENT_KINDS).toContain("rendered_original");
  });
});
