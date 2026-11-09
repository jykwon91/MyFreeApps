import { describe, expect, it } from "vitest";
import { inferKindFromFilename, inferKindsForFiles } from "../utils/inferAttachmentKind";

describe("inferKindFromFilename", () => {
  it("returns move_in_inspection for 'move-in inspection'", () => {
    expect(inferKindFromFilename("Move-In Inspection.pdf")).toBe("move_in_inspection");
  });

  it("returns move_in_inspection for 'move in inspection'", () => {
    expect(inferKindFromFilename("move in inspection.pdf")).toBe("move_in_inspection");
  });

  it("returns move_out_inspection for 'move-out inspection'", () => {
    expect(inferKindFromFilename("Move-Out Inspection.pdf")).toBe("move_out_inspection");
  });

  it("returns signed_lease for 'lease agreement'", () => {
    expect(inferKindFromFilename("Lease Agreement.pdf")).toBe("signed_lease");
  });

  it("returns signed_lease for 'rental agreement'", () => {
    expect(inferKindFromFilename("Rental Agreement.pdf")).toBe("signed_lease");
  });

  it("returns move_in_inspection for generic 'inspection'", () => {
    expect(inferKindFromFilename("Property Inspection.pdf")).toBe("move_in_inspection");
  });

  it("returns insurance_proof for 'insurance'", () => {
    expect(inferKindFromFilename("Tenant Insurance.pdf")).toBe("insurance_proof");
  });

  it("returns signed_addendum for unknown filename", () => {
    expect(inferKindFromFilename("House Rules.pdf")).toBe("signed_addendum");
  });
});

describe("inferKindsForFiles", () => {
  it("promotes first file to signed_lease if none match", () => {
    const kinds = inferKindsForFiles(["House Rules.pdf", "Pet Disclosure.pdf"]);
    expect(kinds[0]).toBe("signed_lease");
    expect(kinds[1]).toBe("signed_addendum");
  });

  it("does not promote if signed_lease already detected", () => {
    const kinds = inferKindsForFiles(["Lease Agreement.pdf", "House Rules.pdf"]);
    expect(kinds).toEqual(["signed_lease", "signed_addendum"]);
  });

  it("returns empty array for empty input", () => {
    expect(inferKindsForFiles([])).toEqual([]);
  });
});
