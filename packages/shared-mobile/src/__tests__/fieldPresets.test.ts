import { FIELD_PRESETS } from "../constants/fieldPresets";

const OTHER_PRESETS = ["otherEmail", "otherPhone", "otherName", "otherAddress", "otherDetails"] as const;

describe("field presets", () => {
  it.each(OTHER_PRESETS)("%s asks the phone not to autofill the owner's details", (name) => {
    expect(FIELD_PRESETS[name]).toMatchObject({ autoComplete: "off", textContentType: "none" });
  });

  it("keeps the right keyboard for someone else's email and phone", () => {
    expect(FIELD_PRESETS.otherEmail).toEqual({
      keyboardType: "email-address",
      autoCapitalize: "none",
      autoCorrect: false,
      autoComplete: "off",
      textContentType: "none",
    });
    expect(FIELD_PRESETS.otherPhone).toEqual({ keyboardType: "phone-pad", autoComplete: "off", textContentType: "none" });
    expect(FIELD_PRESETS.otherName.autoCapitalize).toBe("words");
  });

  it("asks the phone to offer the owner's own email and name", () => {
    expect(FIELD_PRESETS.ownEmail).toEqual({
      keyboardType: "email-address",
      autoCapitalize: "none",
      autoCorrect: false,
      autoComplete: "email",
      textContentType: "emailAddress",
    });
    expect(FIELD_PRESETS.ownName).toEqual({ autoCapitalize: "words", autoComplete: "name", textContentType: "name" });
  });

  it("types links and codes exactly as written", () => {
    expect(FIELD_PRESETS.url).toEqual({ inputMode: "url", autoCapitalize: "none", autoCorrect: false, textContentType: "URL" });
    expect(FIELD_PRESETS.code).toMatchObject({ autoCapitalize: "none", autoCorrect: false, spellCheck: false, autoComplete: "off" });
  });

  it("brings up number pads for amounts and counts", () => {
    expect(FIELD_PRESETS.decimal.keyboardType).toBe("decimal-pad");
    expect(FIELD_PRESETS.wholeNumber.keyboardType).toBe("number-pad");
  });
});
