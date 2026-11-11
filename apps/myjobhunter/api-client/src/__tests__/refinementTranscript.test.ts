import { describe, expect, it } from "vitest";
import { conversationItems } from "../utils/conversationItems";
import { isUserRefinementRole } from "../utils/isUserRefinementRole";
import { refinementTurnBody } from "../utils/refinementTurnBody";
import { refinementTurn } from "./support/refinementSession";

describe("refinementTurnBody", () => {
  it("shows a clarifying question before the proposal, and hides an empty proposal", () => {
    expect(refinementTurnBody(refinementTurn({ clarifying_question: "How many?", proposed_text: "x" }))).toBe("How many?");
    expect(refinementTurnBody(refinementTurn({ proposed_text: "Built 12 APIs" }))).toBe("Built 12 APIs");
    expect(refinementTurnBody(refinementTurn())).toBeNull();
  });

  it("words each user action", () => {
    expect(refinementTurnBody(refinementTurn({ role: "user_accept", proposed_text: "A" }))).toBe("Accepted: A");
    expect(refinementTurnBody(refinementTurn({ role: "user_accept_flagged" }))).toBe(
      "Accepted this suggestion after confirming the details.",
    );
    expect(refinementTurnBody(refinementTurn({ role: "user_request_alternative", user_text: "shorter" }))).toBe("shorter");
    expect(refinementTurnBody(refinementTurn({ role: "user_created_target", user_text: "Led a team" }))).toBe(
      "Picked from the draft: Led a team",
    );
    expect(refinementTurnBody(refinementTurn({ role: "user_skip" }))).toBe("Skipped.");
    expect(refinementTurnBody(refinementTurn({ role: "session_complete" }))).toBeNull();
  });
});

describe("conversationItems", () => {
  it("puts a divider before each change of section and drops turns with nothing to show", () => {
    const items = conversationItems([
      refinementTurn({ id: "a", role: "ai_critique", rationale: "Review done" }),
      refinementTurn({ id: "b", target_section: "Experience", proposed_text: "P1" }),
      refinementTurn({ id: "c", role: "user_accept", target_section: "Experience", proposed_text: "P1" }),
      refinementTurn({ id: "d", target_section: "Skills" }),
      refinementTurn({ id: "e", target_section: "Skills", proposed_text: "P2" }),
      refinementTurn({ id: "f", role: "session_complete", target_section: "Summary" }),
    ]);
    expect(items.map((item) => (item.kind === "divider" ? `|${item.section}` : item.turn.id))).toEqual([
      "a",
      "|Experience",
      "b",
      "c",
      "|Skills",
      "e",
    ]);
  });
});

describe("isUserRefinementRole", () => {
  it("tells the user's turns from the assistant's", () => {
    expect(isUserRefinementRole("user_custom")).toBe(true);
    expect(isUserRefinementRole("ai_proposal")).toBe(false);
    expect(isUserRefinementRole("ai_critique")).toBe(false);
  });
});
