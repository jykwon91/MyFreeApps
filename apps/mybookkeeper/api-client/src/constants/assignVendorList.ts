import type { VendorListArgs } from "../types/vendor/vendor-list-args";

/** The saved vendors a transaction can be assigned to. Generous: listing 100 at once is fine for typical hosts. */
export const ASSIGN_VENDOR_LIST_ARGS: VendorListArgs = { limit: 100, offset: 0 };
