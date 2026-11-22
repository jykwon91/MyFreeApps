import { describe, expect, it } from "vitest";
import { SKILL_REMOVE_MESSAGES } from "../constants/skillRemoveMessages";
import { skillRemoveBody } from "../utils/skillRemoveBody";

describe("skillRemoveBody", () => {
  it("names the skill before the shared sentence", () => {
    expect(skillRemoveBody("TypeScript")).toBe(`TypeScript — ${SKILL_REMOVE_MESSAGES.body}`);
  });
});
