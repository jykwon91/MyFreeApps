import { describe, expect, it } from "vitest";
import { RECEIPT_SEND_FINISHED_CODES } from "../constants/receiptSendFinishedCodes";
import { receiptSendErrorCode } from "../utils/receiptSendErrorCode";

describe("receiptSendErrorCode", () => {
  it("recognises the send route's codes", () => {
    expect(receiptSendErrorCode("receipt_already_sent")).toBe("receipt_already_sent");
    expect(receiptSendErrorCode("gmail_reauth_required")).toBe("gmail_reauth_required");
  });

  it("ignores a sentence, an object's own keys and anything that isn't a string", () => {
    expect(receiptSendErrorCode("This tenant has no email on file.")).toBeNull();
    expect(receiptSendErrorCode("toString")).toBeNull();
    expect(receiptSendErrorCode(undefined)).toBeNull();
    expect(receiptSendErrorCode({ code: "receipt_dismissed" })).toBeNull();
  });

  it("counts only a sent or dismissed receipt as finished", () => {
    expect([...RECEIPT_SEND_FINISHED_CODES].sort()).toEqual(["receipt_already_sent", "receipt_dismissed"]);
  });
});
