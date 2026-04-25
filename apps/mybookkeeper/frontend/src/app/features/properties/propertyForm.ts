import type { Property } from "@/shared/types/property/property";
import type { AddressFields } from "@/shared/types/property/address-fields";
import type { PropertyForm } from "@/shared/types/property/property-form";

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
