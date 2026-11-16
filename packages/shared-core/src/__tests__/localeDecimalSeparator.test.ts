import { describe, expect, it } from "vitest";
import { localeDecimalSeparator } from "../utils/localeDecimalSeparator";

describe("localeDecimalSeparator", () => {
  it("finds a locale's separator with Intl.NumberFormat.format", () => {
    expect(localeDecimalSeparator("en-US")).toBe(".");
    expect(localeDecimalSeparator("de-DE")).toBe(",");
    expect(localeDecimalSeparator("fr-FR")).toBe(",");
  });
});
