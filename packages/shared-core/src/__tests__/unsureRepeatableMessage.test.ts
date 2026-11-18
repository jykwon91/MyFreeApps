import { describe, expect, it } from "vitest";
import { unsureRepeatableMessage } from "../utils/unsureRepeatableMessage";

describe("unsureRepeatableMessage", () => {
  it("says it may have gone through and that a retry is safe, without calling it a failure", () => {
    const message = unsureRepeatableMessage("that vendor was deleted");
    expect(message).toBe("I didn't get an answer, so I'm not sure that vendor was deleted. Trying again is safe.");
    expect(message).not.toMatch(/couldn't/i);
  });
});
