import { extractErrorMessage } from "@platform/ui";
import { hasHttpStatus } from "./http-status";

/** The `detail` POST /organizations/invites/{token}/accept sends when the user already joined. */
export const ALREADY_MEMBER_DETAIL = "Already a member of this organization";

const BAD_REQUEST_STATUS = 400;

/** True when accepting failed only because the person is already in the organization, which is as good as success. */
export function isAlreadyMemberError(error: unknown): boolean {
  return hasHttpStatus(error, BAD_REQUEST_STATUS) && extractErrorMessage(error) === ALREADY_MEMBER_DETAIL;
}
