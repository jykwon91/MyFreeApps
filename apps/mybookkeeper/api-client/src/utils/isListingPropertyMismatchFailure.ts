import { LISTING_PROPERTY_MISMATCH_CODE } from "../constants/leaseProperty";
import { errorDetail } from "./errorDetail";
import { httpStatus } from "./httpStatus";

/** The server refused a lease whose listing is for another house than the one picked, told apart from other 422s by its code. */
export function isListingPropertyMismatchFailure(error: unknown): boolean {
  return httpStatus(error) === 422 && (errorDetail(error) as { code?: unknown } | undefined)?.code === LISTING_PROPERTY_MISMATCH_CODE;
}
