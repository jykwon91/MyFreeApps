import { describe, it, expect } from "vitest";
import { ACCOUNT_COPY } from "../constants/accountCopy";

describe("ACCOUNT_COPY", () => {
  it("says the export holds the practice conversations", () => {
    expect(ACCOUNT_COPY.exportDescription).toContain("profile and practice conversations");
  });

  it("lists what deleting the account removes", () => {
    for (const part of ["practice conversations", "transcripts", "language and level"]) {
      expect(ACCOUNT_COPY.deleteWarning).toContain(part);
    }
  });

  it("recommends two-factor without speaking as 'I' or 'we'", () => {
    expect(ACCOUNT_COPY.twoFactorIntro).toContain("Two-factor authentication");
    expect(ACCOUNT_COPY.twoFactorIntro).toContain("recommended");
    expect(ACCOUNT_COPY.twoFactorIntro).not.toMatch(/\b(I|We) recommend/);
  });
});
