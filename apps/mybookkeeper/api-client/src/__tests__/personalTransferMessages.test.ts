import { describe, expect, it } from "vitest";
import {
  personalSenderForgottenMessage,
  personalSenderLabel,
  personalTransferMarkedMessage,
  personalTransferUnmarkedMessage,
} from "../utils/personalTransferMessages";

const dao = { id: "s1", display_name: "Dao Nguyen", payer_handle: "" };

describe("personalTransferMarkedMessage", () => {
  it("says who is skipped from now on", () => {
    expect(personalTransferMarkedMessage({ transaction_id: "t1", remembered_sender: dao, also_cleared: 0 })).toBe(
      "Marked as a personal transfer. I'll skip Dao Nguyen's payments from now on.",
    );
  });

  it("says how many more payments it cleared", () => {
    expect(personalTransferMarkedMessage({ transaction_id: "t1", remembered_sender: dao, also_cleared: 1 })).toContain(
      "I also cleared 1 more payment from them.",
    );
    expect(personalTransferMarkedMessage({ transaction_id: "t1", remembered_sender: dao, also_cleared: 17 })).toContain(
      "I also cleared 17 more payments from them.",
    );
  });

  it("names no one when the payment named no sender", () => {
    expect(personalTransferMarkedMessage({ transaction_id: "t1", remembered_sender: null, also_cleared: 0 })).toBe(
      "Marked as a personal transfer. It won't count towards your totals.",
    );
  });
});

describe("personalTransferUnmarkedMessage", () => {
  it("mentions Payment Review and the forgotten sender only when they apply", () => {
    const base = { transaction_id: "t1", status: "pending" as const };
    expect(personalTransferUnmarkedMessage({ ...base, back_in_review: false, forgotten_senders: 0 })).toBe(
      "Got it, that's not a personal transfer.",
    );
    expect(personalTransferUnmarkedMessage({ ...base, back_in_review: true, forgotten_senders: 1 })).toBe(
      "Got it, that's not a personal transfer. It's back in Payment Review. I'll stop skipping that sender too.",
    );
  });
});

describe("personalSenderLabel", () => {
  it("adds the handle when there is one", () => {
    expect(personalSenderLabel(dao)).toBe("Dao Nguyen");
    expect(personalSenderLabel({ ...dao, payer_handle: "dao@example.com" })).toBe("Dao Nguyen (dao@example.com)");
  });
});

describe("personalSenderForgottenMessage", () => {
  it("says their payments come back to review", () => {
    expect(personalSenderForgottenMessage(dao)).toBe(
      "I'll stop skipping Dao Nguyen. Their next payment will show up in Payment Review.",
    );
  });
});
