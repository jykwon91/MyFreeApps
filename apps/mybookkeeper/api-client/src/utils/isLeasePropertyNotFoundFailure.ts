import { LEASE_PROPERTY_NOT_FOUND_DETAIL } from "../constants/leaseProperty";
import { errorDetail } from "./errorDetail";
import { httpStatus } from "./httpStatus";

/** The server couldn't find the house picked for a lease in this workspace, told apart from the tenant's or listing's 404. */
export function isLeasePropertyNotFoundFailure(error: unknown): boolean {
  return httpStatus(error) === 404 && errorDetail(error) === LEASE_PROPERTY_NOT_FOUND_DETAIL;
}
