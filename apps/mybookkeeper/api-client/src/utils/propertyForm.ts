import { PROPERTY_FORM_PROBLEMS } from "../constants/propertyForm";
import type { AddressFields } from "../types/property/AddressFields";
import type { Property } from "../types/property/property";
import type { PropertyClassification } from "../types/property/PropertyClassification";
import type { PropertyForm } from "../types/property/PropertyForm";
import type { PropertyFormProblems } from "../types/property/PropertyFormProblems";
import type { PropertyType } from "../types/property/PropertyType";
import type { PropertyWrite } from "../types/property/PropertyWrite";

export function blankForm(): PropertyForm {
  return { name: "", street: "", city: "", state: "", zip: "", classification: "unclassified", type: null };
}

export function addressComplete(f: AddressFields): boolean {
  return !!(f.street.trim() && f.city.trim() && f.state.trim() && f.zip.trim());
}

export function toAddress(f: AddressFields): string {
  const line2 = [f.city, [f.state, f.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return [f.street, line2].filter(Boolean).join(", ");
}

export function fromProperty(p: Property): PropertyForm {
  // Parse stored "street, city, state zip" format back into fields
  const parts = (p.address ?? "").split(",").map((s) => s.trim());
  const street = parts[0] ?? "";
  const city = parts[1] ?? "";
  const stateZip = (parts[2] ?? "").trim().split(" ");
  const state = stateZip[0] ?? "";
  const zip = stateZip[1] ?? "";
  return { name: p.name, classification: p.classification, type: p.type, street, city, state, zip };
}

/** Only an investment has a rental type; picking one defaults to short-term. */
export function withClassification(form: PropertyForm, classification: PropertyClassification): PropertyForm {
  const type: PropertyType | null = classification === "investment" ? (form.type ?? "short_term") : null;
  return { ...form, classification, type };
}

function addressChanged(clean: PropertyForm, was: PropertyForm): boolean {
  return clean.street !== was.street || clean.city !== was.city || clean.state !== was.state || clean.zip !== was.zip;
}

/** An address saved in some other shape is left alone until it is edited, so it can't block a rename. */
export function propertyFormProblems(form: PropertyForm, original: Property | null = null): PropertyFormProblems {
  const problems: PropertyFormProblems = {};
  const clean = trimmedForm(form);
  if (!clean.name) problems.name = PROPERTY_FORM_PROBLEMS.nameRequired;
  if (original && !addressChanged(clean, trimmedForm(fromProperty(original)))) return problems;
  if (!clean.street) problems.street = PROPERTY_FORM_PROBLEMS.streetRequired;
  if (!clean.city) problems.city = PROPERTY_FORM_PROBLEMS.cityRequired;
  if (!clean.state) problems.state = PROPERTY_FORM_PROBLEMS.stateRequired;
  if (!clean.zip) problems.zip = PROPERTY_FORM_PROBLEMS.zipRequired;
  return problems;
}

export function trimmedForm(form: PropertyForm): PropertyForm {
  return { ...form, name: form.name.trim(), street: form.street.trim(), city: form.city.trim(), state: form.state.trim(), zip: form.zip.trim() };
}

export function toPropertyWrite(form: PropertyForm): PropertyWrite {
  return {
    name: form.name,
    address: toAddress(form),
    classification: form.classification,
    ...(form.type ? { type: form.type } : {}),
  };
}

/** Nothing typed yet, so there's nothing to lose by leaving. */
export function isBlank(form: PropertyForm): boolean {
  const { name, street, city, state, zip, classification } = trimmedForm(form);
  return !name && !street && !city && !state && !zip && classification === "unclassified";
}

/**
 * Only what the form changed from `original`. The address is left out when its parts are untouched, since
 * a saved address that isn't "street, city, state zip" can't be rebuilt from them without losing something.
 */
export function propertyChanges(form: PropertyForm, original: Property): Partial<PropertyWrite> {
  const clean = trimmedForm(form);
  const was = trimmedForm(fromProperty(original));
  const changes: Partial<PropertyWrite> = {};
  if (clean.name !== was.name) changes.name = clean.name;
  if (addressChanged(clean, was)) {
    changes.address = toAddress(clean);
  }
  if (clean.classification !== was.classification || clean.type !== was.type) {
    changes.classification = clean.classification;
    if (clean.type) changes.type = clean.type;
  }
  return changes;
}
