import type { VendorCategory } from "./vendor-category";

export interface VendorPageArgs {
  category?: VendorCategory;
  /** True narrows the list to preferred vendors; omitted means all of them. */
  preferred?: boolean;
}
