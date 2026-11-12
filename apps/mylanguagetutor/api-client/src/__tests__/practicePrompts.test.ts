import { describe, expect, it } from "vitest";
import { startConversationPrompt } from "../utils/startConversationPrompt";
import { typedAnswerPlaceholder } from "../utils/typedAnswerPlaceholder";

describe("the practice prompts", () => {
  it("name the language", () => {
    expect(startConversationPrompt("Spanish")).toBe("Say hello in Spanish to start the conversation.");
    expect(typedAnswerPlaceholder("Spanish")).toBe("Write in Spanish…");
  });
});
