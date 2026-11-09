import { describe, expect, it } from "vitest";
import {
  EMPTY_VENDOR_FORM,
  formValuesToCreateRequest,
  formValuesToUpdateRequest,
  vendorDirtyFields,
  vendorFormProblems,
  vendorToFormValues,
} from "../utils/vendorForm";
import type { VendorResponse } from "../types/vendor/vendor-response";

const vendor: VendorResponse = {
  id: "v1",
  organization_id: "o1",
  user_id: "u1",
  name: "Reliable Plumbing",
  category: "plumber",
  phone: null,
  email: "a@b.co",
  address: null,
  hourly_rate: "95.00",
  flat_rate_notes: null,
  preferred: true,
  notes: null,
  last_used_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("vendor form values", () => {
  it("turns missing optional fields into empty text and back to null", () => {
    const values = vendorToFormValues(vendor);
    expect(values.phone).toBe("");
    expect(formValuesToCreateRequest(values).phone).toBeNull();
    expect(formValuesToCreateRequest(values).hourly_rate).toBe("95.00");
  });

  it("trims text before sending", () => {
    const body = formValuesToCreateRequest({ ...EMPTY_VENDOR_FORM, name: "  Bob ", notes: "  hi " });
    expect(body.name).toBe("Bob");
    expect(body.notes).toBe("hi");
  });
});

describe("vendorDirtyFields and update request", () => {
  it("reports nothing when only whitespace differs", () => {
    const saved = vendorToFormValues(vendor);
    expect(vendorDirtyFields({ ...saved, name: " Reliable Plumbing " }, saved)).toEqual({});
  });

  it("sends only touched fields and null for an emptied one", () => {
    const saved = vendorToFormValues(vendor);
    const values = { ...saved, name: "New", email: "" };
    const dirty = vendorDirtyFields(values, saved);
    expect(dirty).toEqual({ name: true, email: true });
    expect(formValuesToUpdateRequest(values, dirty)).toEqual({ name: "New", email: null });
  });
});

describe("vendorFormProblems", () => {
  it("accepts a valid form", () => {
    expect(vendorFormProblems({ ...EMPTY_VENDOR_FORM, name: "Bob", email: "a@b.co", hourly_rate: "95.50" })).toEqual({});
  });

  it("flags a missing name, bad email and bad rate", () => {
    const problems = vendorFormProblems({ ...EMPTY_VENDOR_FORM, email: "nope", hourly_rate: "9.999" });
    expect(Object.keys(problems).sort()).toEqual(["email", "hourly_rate", "name"]);
  });
});
