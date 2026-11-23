import { describe, it, expect } from "vitest";
import { ACCOUNT_COPY } from "../constants/accountCopy";

describe("ACCOUNT_COPY", () => {
  it("lists what deleting the account removes", () => {
    for (const part of ["recipes", "versions", "cook logs"]) {
      expect(ACCOUNT_COPY.deleteWarning).toContain(part);
    }
    expect(ACCOUNT_COPY.deleteWarning).not.toContain("all associated data");
  });

  it("recommends two-factor without speaking as 'I' or 'we'", () => {
    expect(ACCOUNT_COPY.twoFactorIntro).toContain("Two-factor authentication");
    expect(ACCOUNT_COPY.twoFactorIntro).toContain("recommended");
    expect(ACCOUNT_COPY.twoFactorIntro).not.toMatch(/\b(I|We) recommend/);
  });
});
