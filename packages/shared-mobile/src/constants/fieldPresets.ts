import type { FieldPreset } from "../types/FieldPreset";

/**
 * Asks the phone not to autofill the owner's name, email, phone or address. Android honours `autoComplete: "off"`;
 * on iOS, `textContentType: "none"` removes the hint, but QuickType may still guess from the keyboard and label.
 */
const NO_AUTOFILL = { autoComplete: "off", textContentType: "none" } as const satisfies FieldPreset;

const EMAIL_KEYBOARD = { keyboardType: "email-address", autoCapitalize: "none", autoCorrect: false } as const satisfies FieldPreset;

/**
 * What each kind of text field brings up: keyboard, capitalisation, autocorrect and autofill. Spread a preset
 * first, so a prop written after it wins.
 * `own*` fields hold the signed-in person's details, so they ask the phone to offer them. `other*` fields hold
 * someone else's (a tenant, a vendor, a contact, a company), so they ask the phone not to autofill the owner's
 * details, while the keyboard still fits. Free text needs no preset: React Native already capitalises sentences
 * and autocorrects.
 */
export const FIELD_PRESETS = {
  ownEmail: { ...EMAIL_KEYBOARD, autoComplete: "email", textContentType: "emailAddress" },
  ownName: { autoCapitalize: "words", autoComplete: "name", textContentType: "name" },
  otherEmail: { ...EMAIL_KEYBOARD, ...NO_AUTOFILL },
  otherPhone: { keyboardType: "phone-pad", ...NO_AUTOFILL },
  /** A person's or a company's name. */
  otherName: { autoCapitalize: "words", ...NO_AUTOFILL },
  /** A street, a city or a place: a rental, a vendor's office, a company's headquarters. */
  otherAddress: { autoCapitalize: "words", ...NO_AUTOFILL },
  /** Any other detail about someone else, like where they work. */
  otherDetails: NO_AUTOFILL,
  /** `inputMode` picks the keyboard on both platforms, and React Native ignores `keyboardType` when it's set. */
  url: { inputMode: "url", autoCapitalize: "none", autoCorrect: false, textContentType: "URL" },
  /** Codes, ids, account numbers, labels and expressions: typed exactly, never "corrected". */
  code: { autoCapitalize: "none", autoCorrect: false, spellCheck: false, ...NO_AUTOFILL },
  /** Money, rates and other amounts with a decimal point. */
  decimal: { keyboardType: "decimal-pad" },
  /** Counts, days, minutes and years. */
  wholeNumber: { keyboardType: "number-pad" },
} as const satisfies Record<string, FieldPreset>;
