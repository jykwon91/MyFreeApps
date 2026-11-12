import { describe, expect, it } from "vitest";
import { onboardingLevelPath } from "../utils/onboardingLevelPath";
import { practicePath } from "../utils/practicePath";

describe("onboardingLevelPath", () => {
  it("passes the language on to the level step", () => {
    expect(onboardingLevelPath("es")).toBe("/onboarding/level?language=es");
  });

  it("encodes a code that isn't URL-safe", () => {
    expect(onboardingLevelPath("pt BR&x")).toBe("/onboarding/level?language=pt%20BR%26x");
  });
});

describe("practicePath", () => {
  it("opens practice for the scenario", () => {
    expect(practicePath("cafe")).toBe("/practice?scenario=cafe");
  });

  it("encodes a slug that isn't URL-safe", () => {
    expect(practicePath("a/b?c")).toBe("/practice?scenario=a%2Fb%3Fc");
  });
});
