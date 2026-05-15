/**
 * Unit tests for the order-status helpers.
 *
 * `advanceChoices` is the source of truth for which buttons render on each
 * OrderCard; the most critical case is the `cooking` fork (PR 8) which
 * surfaces both the SMS path and the no-text path.
 */
import { describe, expect, it } from "vitest";

import {
  advanceChoices,
  isTerminal,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_TONES,
} from "@/features/service/orderStatus";

describe("advanceChoices", () => {
  it("returns single 'cooking' option for not_started", () => {
    expect(advanceChoices("not_started")).toEqual(["cooking"]);
  });

  it("forks cooking into ready_text_sent (primary) + ready_waiting (secondary)", () => {
    // First element is the primary (SMS) action; second is the no-text fallback.
    expect(advanceChoices("cooking")).toEqual([
      "ready_text_sent",
      "ready_waiting",
    ]);
  });

  it("returns picked_up for ready_text_sent", () => {
    expect(advanceChoices("ready_text_sent")).toEqual(["picked_up"]);
  });

  it("returns picked_up for ready_waiting", () => {
    expect(advanceChoices("ready_waiting")).toEqual(["picked_up"]);
  });

  it("returns nothing for terminal states", () => {
    expect(advanceChoices("picked_up")).toEqual([]);
    expect(advanceChoices("no_show")).toEqual([]);
  });
});

describe("isTerminal", () => {
  it("returns true for picked_up", () => {
    expect(isTerminal("picked_up")).toBe(true);
  });

  it("returns true for no_show", () => {
    expect(isTerminal("no_show")).toBe(true);
  });

  it("returns false for all non-terminal states", () => {
    for (const s of ["not_started", "cooking", "ready_text_sent", "ready_waiting"] as const) {
      expect(isTerminal(s)).toBe(false);
    }
  });
});

describe("ORDER_STATUS_LABELS / TONES coverage", () => {
  // Sanity check: every status has a label + tone so the dashboard never
  // renders raw enum strings to the operator.
  it("has a label for every status", () => {
    for (const s of [
      "not_started",
      "cooking",
      "ready_text_sent",
      "ready_waiting",
      "picked_up",
      "no_show",
    ] as const) {
      expect(typeof ORDER_STATUS_LABELS[s]).toBe("string");
      expect(ORDER_STATUS_LABELS[s].length).toBeGreaterThan(0);
    }
  });

  it("has a tone for every status", () => {
    for (const s of [
      "not_started",
      "cooking",
      "ready_text_sent",
      "ready_waiting",
      "picked_up",
      "no_show",
    ] as const) {
      expect(typeof ORDER_STATUS_TONES[s]).toBe("string");
    }
  });
});
