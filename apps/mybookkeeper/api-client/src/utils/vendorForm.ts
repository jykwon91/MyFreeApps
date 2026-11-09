import { VENDOR_EMAIL_PATTERN, VENDOR_FORM_PROBLEMS, VENDOR_HOURLY_RATE_PATTERN } from "../constants/vendorForm";
import type { VendorCreateRequest } from "../types/vendor/vendor-create-request";
import type { VendorFormDirty } from "../types/vendor/vendor-form-dirty";
import type { VendorFormProblems } from "../types/vendor/vendor-form-problems";
import type { VendorFormValues } from "../types/vendor/vendor-form-values";
import type { VendorResponse } from "../types/vendor/vendor-response";
import type { VendorUpdateRequest } from "../types/vendor/vendor-update-request";

export const EMPTY_VENDOR_FORM: VendorFormValues = {
  name: "",
  category: "handyman",
  phone: "",
  email: "",
  address: "",
  hourly_rate: "",
  flat_rate_notes: "",
  preferred: false,
  notes: "",
};

export function vendorToFormValues(vendor: VendorResponse): VendorFormValues {
  return {
    name: vendor.name,
    category: vendor.category,
    phone: vendor.phone ?? "",
    email: vendor.email ?? "",
    address: vendor.address ?? "",
    hourly_rate: vendor.hourly_rate ?? "",
    flat_rate_notes: vendor.flat_rate_notes ?? "",
    preferred: vendor.preferred,
    notes: vendor.notes ?? "",
  };
}

export function formValuesToCreateRequest(values: VendorFormValues): VendorCreateRequest {
  return {
    name: values.name.trim(),
    category: values.category,
    phone: values.phone.trim() || null,
    email: values.email.trim() || null,
    address: values.address.trim() || null,
    hourly_rate: values.hourly_rate.trim() || null,
    flat_rate_notes: values.flat_rate_notes.trim() || null,
    preferred: values.preferred,
    notes: values.notes.trim() || null,
  };
}

export function formValuesToUpdateRequest(values: VendorFormValues, dirty: VendorFormDirty): VendorUpdateRequest {
  const out: VendorUpdateRequest = {};
  if (dirty.name) out.name = values.name.trim();
  if (dirty.category) out.category = values.category;
  if (dirty.phone) out.phone = values.phone.trim() || null;
  if (dirty.email) out.email = values.email.trim() || null;
  if (dirty.address) out.address = values.address.trim() || null;
  if (dirty.hourly_rate) out.hourly_rate = values.hourly_rate.trim() || null;
  if (dirty.flat_rate_notes) out.flat_rate_notes = values.flat_rate_notes.trim() || null;
  if (dirty.preferred) out.preferred = values.preferred;
  if (dirty.notes) out.notes = values.notes.trim() || null;
  return out;
}

/** The fields whose sent value differs from the saved one, so an edit only changes what was touched. */
export function vendorDirtyFields(values: VendorFormValues, saved: VendorFormValues): VendorFormDirty {
  const sent = formValuesToCreateRequest(values);
  const was = formValuesToCreateRequest(saved);
  const dirty: VendorFormDirty = {};
  for (const field of Object.keys(sent) as (keyof VendorFormValues)[]) {
    if (sent[field] !== was[field]) dirty[field] = true;
  }
  return dirty;
}

export function vendorFormProblems(values: VendorFormValues): VendorFormProblems {
  const problems: VendorFormProblems = {};
  const email = values.email.trim();
  const rate = values.hourly_rate.trim();
  if (!values.name.trim()) problems.name = VENDOR_FORM_PROBLEMS.nameRequired;
  if (email && !VENDOR_EMAIL_PATTERN.test(email)) problems.email = VENDOR_FORM_PROBLEMS.emailInvalid;
  if (rate && !VENDOR_HOURLY_RATE_PATTERN.test(rate)) problems.hourly_rate = VENDOR_FORM_PROBLEMS.rateInvalid;
  return problems;
}
