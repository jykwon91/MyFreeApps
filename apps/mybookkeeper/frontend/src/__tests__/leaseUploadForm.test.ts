import { describe, expect, it } from "vitest";
import { EMPTY_LEASE_IMPORT_FORM } from "@mybookkeeper/api-client/utils/leaseImportForm";
import { leaseAttachmentForm, leaseImportForm } from "@/shared/lib/lease-upload-form";

const file = new File(["x"], "lease.pdf", { type: "application/pdf" });

describe("lease upload forms", () => {
  it("sends a file and its kind", () => {
    const form = leaseAttachmentForm(file, "signed_lease");
    expect(form.get("kind")).toBe("signed_lease");
    expect((form.get("file") as File).name).toBe("lease.pdf");
  });

  it("sends the import fields, trimmed, as signed", () => {
    const form = leaseImportForm({ applicantId: "a1", listingId: "li1", startsOn: "2026-01-01", endsOn: "2026-12-31", notes: "  hi " }, [file]);
    expect(form.get("applicant_id")).toBe("a1");
    expect(form.get("status")).toBe("signed");
    expect(form.get("listing_id")).toBe("li1");
    expect(form.get("starts_on")).toBe("2026-01-01");
    expect(form.get("ends_on")).toBe("2026-12-31");
    expect(form.get("notes")).toBe("hi");
  });

  it("leaves out what wasn't given", () => {
    const form = leaseImportForm({ ...EMPTY_LEASE_IMPORT_FORM, applicantId: "a1" }, [file, file]);
    for (const field of ["listing_id", "starts_on", "ends_on", "notes"]) expect(form.get(field)).toBeNull();
    expect(form.getAll("files")).toHaveLength(2);
  });
});
