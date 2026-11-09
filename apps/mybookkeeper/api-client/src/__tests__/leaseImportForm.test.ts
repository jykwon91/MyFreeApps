import { describe, expect, it } from "vitest";
import { EMPTY_LEASE_IMPORT_FORM, leaseImportFields, leaseImportProblems } from "../utils/leaseImportForm";

const FILLED = { ...EMPTY_LEASE_IMPORT_FORM, applicantId: "a1" };

describe("leaseImportProblems", () => {
  it("needs a tenant and at least one file", () => {
    expect(leaseImportProblems(EMPTY_LEASE_IMPORT_FORM, 0)).toEqual({ applicantId: "applicant_required", files: "files_required" });
    expect(leaseImportProblems(FILLED, 1)).toEqual({});
  });

  it("refuses an end date before the start", () => {
    expect(leaseImportProblems({ ...FILLED, startsOn: "2026-05-01", endsOn: "2026-04-30" }, 1)).toEqual({ endsOn: "ends_before_starts" });
    expect(leaseImportProblems({ ...FILLED, startsOn: "2026-05-01", endsOn: "2026-05-01" }, 1)).toEqual({});
  });

  it("lets either date stand alone", () => {
    expect(leaseImportProblems({ ...FILLED, endsOn: "2026-04-30" }, 1)).toEqual({});
  });

  it("refuses notes longer than the server takes", () => {
    expect(leaseImportProblems({ ...FILLED, notes: "x".repeat(2001) }, 1)).toEqual({ notes: "notes_too_long" });
    expect(leaseImportProblems({ ...FILLED, notes: "x".repeat(2000) }, 1)).toEqual({});
  });
});

describe("leaseImportFields", () => {
  it("always sends the tenant and a signed status", () => {
    expect(leaseImportFields(FILLED)).toEqual({ applicant_id: "a1", status: "signed" });
  });

  it("sends what was given and trims the notes", () => {
    expect(leaseImportFields({ applicantId: "a1", listingId: "l1", startsOn: "2026-05-01", endsOn: "2027-04-30", notes: "  Signed in person  " })).toEqual({
      applicant_id: "a1",
      status: "signed",
      listing_id: "l1",
      starts_on: "2026-05-01",
      ends_on: "2027-04-30",
      notes: "Signed in person",
    });
  });

  it("leaves out notes that are only spaces", () => {
    expect(leaseImportFields({ ...FILLED, notes: "   " })).not.toHaveProperty("notes");
  });
});
