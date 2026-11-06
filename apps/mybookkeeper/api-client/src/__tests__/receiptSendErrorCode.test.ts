import { describe, expect, it } from "vitest";
import { RECEIPT_SEND_FINISHED_CODES } from "../constants/receiptSendFinishedCodes";
import { receiptSendErrorCode } from "../utils/receiptSendErrorCode";
import { receiptSendErrorMessage } from "../utils/receiptSendErrorMessage";
import { sentFromOtherGmail } from "../utils/sentFromOtherGmail";

const OTHER_GMAIL = { code: "receipt_sent_from_other_gmail", sender_gmail_address: "old@gmail.com" };

describe("receiptSendErrorCode", () => {
  it("recognises the send route's codes", () => {
    expect(receiptSendErrorCode("receipt_already_sent")).toBe("receipt_already_sent");
    expect(receiptSendErrorCode("gmail_reauth_required")).toBe("gmail_reauth_required");
  });

  it("reads the code of a refusal that names an account", () => {
    expect(receiptSendErrorCode(OTHER_GMAIL)).toBe("receipt_sent_from_other_gmail");
  });

  it("ignores a sentence, an object's own keys and anything that isn't a code", () => {
    expect(receiptSendErrorCode("This tenant has no email on file.")).toBeNull();
    expect(receiptSendErrorCode("toString")).toBeNull();
    expect(receiptSendErrorCode(undefined)).toBeNull();
    expect(receiptSendErrorCode(null)).toBeNull();
    expect(receiptSendErrorCode({ code: "toString" })).toBeNull();
    expect(receiptSendErrorCode([{ msg: "field required" }])).toBeNull();
  });

  it("counts only a sent or dismissed receipt as finished", () => {
    expect([...RECEIPT_SEND_FINISHED_CODES].sort()).toEqual(["receipt_already_sent", "receipt_dismissed"]);
  });
});

describe("sentFromOtherGmail", () => {
  it("names the account only for the code asked about", () => {
    expect(sentFromOtherGmail(OTHER_GMAIL, "receipt_sent_from_other_gmail")).toBe("old@gmail.com");
    expect(sentFromOtherGmail(OTHER_GMAIL, "reply_sent_from_other_gmail")).toBeNull();
  });

  it("names nothing without an address", () => {
    expect(sentFromOtherGmail({ code: "receipt_sent_from_other_gmail" }, "receipt_sent_from_other_gmail")).toBeNull();
    expect(sentFromOtherGmail({ ...OTHER_GMAIL, sender_gmail_address: "" }, "receipt_sent_from_other_gmail")).toBeNull();
    expect(sentFromOtherGmail("receipt_sent_from_other_gmail", "receipt_sent_from_other_gmail")).toBeNull();
    expect(sentFromOtherGmail(null, "receipt_sent_from_other_gmail")).toBeNull();
  });
});

describe("receiptSendErrorMessage", () => {
  it("names the account a stuck send went through", () => {
    expect(receiptSendErrorMessage("receipt_sent_from_other_gmail", OTHER_GMAIL)).toContain("from old@gmail.com,");
  });

  it("says the code's words when there's no account to name", () => {
    expect(receiptSendErrorMessage("receipt_sent_from_other_gmail", { code: "receipt_sent_from_other_gmail" })).toContain(
      "from a Gmail account,",
    );
    expect(receiptSendErrorMessage("receipt_already_sent", "receipt_already_sent")).toBe(
      "That receipt already went out, so I didn't send it again.",
    );
  });
});
