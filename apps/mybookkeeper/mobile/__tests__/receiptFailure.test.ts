import { RECEIPT_SEND_ERROR_MESSAGES } from "@mybookkeeper/api-client/constants/receiptSendErrorMessages";
import { FIX_ON_WEBSITE, RECEIPTS_MESSAGES as MESSAGES } from "../src/constants/receipts";
import { dismissFailure, sendFailure } from "../src/features/receipts/receiptFailure";

describe("telling send refusals apart", () => {
  it.each([
    [{ status: undefined }, { kind: "unsure" }],
    [{ status: 409, data: { detail: "receipt_already_sent" } }, { kind: "finished", message: RECEIPT_SEND_ERROR_MESSAGES.receipt_already_sent }],
    [{ status: 422, data: { detail: "receipt_dismissed" } }, { kind: "finished", message: RECEIPT_SEND_ERROR_MESSAGES.receipt_dismissed }],
    [{ status: 404, data: { detail: "gone" } }, { kind: "finished", message: MESSAGES.gone }],
    [{ status: 422, data: { detail: "No email" } }, { kind: "recheck", fallback: MESSAGES.couldntSend }],
    [{ status: 503, data: { detail: "gmail_reauth_required" } }, { kind: "recheck", fallback: `${RECEIPT_SEND_ERROR_MESSAGES.gmail_reauth_required} ${FIX_ON_WEBSITE}` }],
    [{ status: 502, data: { detail: "Gmail said no" } }, { kind: "message", message: MESSAGES.gmailRefused }],
    // The proxy's own 5xx, with no detail from the app: the send may have gone out.
    [{ status: 502, data: "<html>Bad Gateway</html>" }, { kind: "unsure" }],
    [{ status: 504 }, { kind: "unsure" }],
    [{ status: 500, data: "Internal Server Error" }, { kind: "unsure" }],
  ])("reads %j", (error, outcome) => {
    expect(sendFailure(error)).toEqual(outcome);
  });
});

describe("telling dismiss refusals apart", () => {
  it.each([
    [{ status: undefined }, MESSAGES.dismissUnreachable, false],
    [{ status: 403 }, MESSAGES.viewerRefused, false],
    [{ status: 404 }, MESSAGES.dismissGone, true],
    [{ status: 409 }, MESSAGES.dismissWhileSending, false],
    [{ status: 422 }, MESSAGES.dismissAlreadyHandled, true],
    [{ status: 500 }, MESSAGES.couldntDismiss, false],
  ])("tells %j apart", (error, message, isFinished) => {
    expect(dismissFailure(error)).toEqual({ message, isFinished });
  });
});
