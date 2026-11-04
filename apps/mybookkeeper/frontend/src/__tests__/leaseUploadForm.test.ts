import { describe, expect, it } from "vitest";
import { leaseAttachmentForm, leaseImportForm } from "@/shared/lib/lease-upload-form";

const file = new File(["x"], "lease.pdf", { type: "application/pdf" });

describe("lease upload forms", () => {
  it("sends a file and its kind", () => {
    const form = leaseAttachmentForm(file, "signed_lease");
    expect(form.get("kind")).toBe("signed_lease");
    expect((form.get("file") as File).name).toBe("lease.pdf");
  });

  it("sends the successor pointer the import route accepts", () => {
    const form = leaseImportForm({ applicant_id: "a1", files: [file], parent_lease_id: "l0" });
    expect(form.get("parent_lease_id")).toBe("l0");
  });

  it("leaves out what wasn't given", () => {
    const form = leaseImportForm({ applicant_id: "a1", files: [file, file] });
    expect(form.get("listing_id")).toBeNull();
    expect(form.get("parent_lease_id")).toBeNull();
    expect(form.getAll("files")).toHaveLength(2);
  });
});
