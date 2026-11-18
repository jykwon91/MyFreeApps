import { SCREENING_MESSAGES } from "../src/constants/applicantScreening";
import { EVENT_MESSAGES } from "../src/constants/calendarEventDetail";
import { POLICY_ATTACHMENT_MESSAGES } from "../src/constants/insuranceForm";
import { LEASE_MESSAGES } from "../src/constants/leases";
import { UPLOAD_MESSAGES } from "../src/constants/uploads";
import { screeningUploadFailure } from "../src/features/applicants/screeningUploadFailure";
import { attachmentUploadFailure as eventUploadFailure } from "../src/features/calendar/calendarEventFailures";
import { attachmentUploadFailure as policyUploadFailure } from "../src/features/insurance/policyFailure";
import { leaseUploadFailure } from "../src/features/leases/leaseUploadFailure";

const LOST = { status: undefined, data: "Network Error" };
const PROXY = { status: 502, data: "<html>Bad Gateway</html>" };
const refused = (status: number) => ({ status, data: { detail: "A developer's message" } });

/** An upload whose answer is lost, or that a proxy broke, may have stored the file: a retry would add a second copy. */
describe.each([
  ["a policy document", policyUploadFailure, POLICY_ATTACHMENT_MESSAGES.uploadUnsure, POLICY_ATTACHMENT_MESSAGES.uploadFailed, [[403, POLICY_ATTACHMENT_MESSAGES.notAllowed], [413, POLICY_ATTACHMENT_MESSAGES.tooBig], [415, POLICY_ATTACHMENT_MESSAGES.badType]]],
  ["a lease file", leaseUploadFailure, LEASE_MESSAGES.uploadUnsure, LEASE_MESSAGES.uploadFailed, [[403, UPLOAD_MESSAGES.notAllowed], [404, LEASE_MESSAGES.goneWhileAdding], [413, LEASE_MESSAGES.tooBig]]],
  ["a screening result", screeningUploadFailure, SCREENING_MESSAGES.uploadUnsure, SCREENING_MESSAGES.uploadFailed, [[403, UPLOAD_MESSAGES.notAllowed], [415, SCREENING_MESSAGES.badFile], [422, SCREENING_MESSAGES.needsReason]]],
  ["a booking's file", eventUploadFailure, EVENT_MESSAGES.uploadUnsure, EVENT_MESSAGES.uploadFailed, [[403, EVENT_MESSAGES.notAllowed], [413, EVENT_MESSAGES.uploadTooBig], [415, EVENT_MESSAGES.uploadBadType]]],
] as const)("uploading %s", (_what, failure, unsure, tryAgain, refusals) => {
  it("isn't sure it failed when no answer came back", () => {
    expect(failure(LOST)).toBe(unsure);
  });

  it("isn't sure it failed after a proxy error with no reason", () => {
    expect(failure(PROXY)).toBe(unsure);
  });

  it("offers a retry when the server refused on purpose", () => {
    expect(failure(refused(500))).toBe(tryAgain);
  });

  it.each(refusals)("keeps its own words for a %i", (status, message) => {
    expect(failure(refused(status))).toBe(message);
  });
});
