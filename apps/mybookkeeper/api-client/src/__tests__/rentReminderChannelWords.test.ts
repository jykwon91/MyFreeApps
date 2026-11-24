import { describe, expect, it } from "vitest";
import { rentReminderChannelWord, rentReminderChannelWords } from "../utils/rentReminderChannelWords";

describe("rentReminderChannelWord", () => {
  it("names each channel the way a sentence does", () => {
    expect(rentReminderChannelWord("email")).toBe("email");
    expect(rentReminderChannelWord("sms")).toBe("text");
  });
});

describe("rentReminderChannelWords", () => {
  it("lists the channels in the order given", () => {
    expect(rentReminderChannelWords(["email"])).toBe("email");
    expect(rentReminderChannelWords(["sms"])).toBe("text");
    expect(rentReminderChannelWords(["email", "sms"])).toBe("email and text");
    expect(rentReminderChannelWords(["sms", "email"])).toBe("text and email");
  });
});
