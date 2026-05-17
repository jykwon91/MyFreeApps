/**
 * summarizeSkips — turns bulk-accept's skipped[] into the concise toast the
 * operator sees instead of a bare "Accepted 0 lineups". Identical reasons
 * dedupe (one phrase for every missing-utility lineup) and the list is capped
 * so a 10-lineup batch can't produce an unreadable wall of text.
 */
import { describe, expect, it } from "vitest";
import { summarizeSkips } from "@/pages/Review";
import type { BulkAcceptSkip } from "@/types/game";

const skip = (lineup_id: string, reason: string): BulkAcceptSkip => ({
  lineup_id,
  reason,
});

describe("summarizeSkips", () => {
  it("uses singular for one skipped lineup and includes the reason", () => {
    const out = summarizeSkips([skip("a", "missing required fields: utility_type_id")]);
    expect(out).toContain("1 lineup skipped");
    expect(out).not.toContain("1 lineups");
    expect(out).toContain("utility_type_id");
  });

  it("pluralizes and dedupes identical reasons into one phrase", () => {
    const out = summarizeSkips([
      skip("a", "missing required fields: utility_type_id"),
      skip("b", "missing required fields: utility_type_id"),
      skip("c", "missing required fields: utility_type_id"),
    ]);
    expect(out).toContain("3 lineups skipped");
    // Reason appears once despite three lineups.
    expect(out.match(/utility_type_id/g)).toHaveLength(1);
  });

  it("caps the reason list and reports the overflow count", () => {
    const out = summarizeSkips([
      skip("a", "reason one"),
      skip("b", "reason two"),
      skip("c", "reason three"),
      skip("d", "reason four"),
    ]);
    expect(out).toContain("4 lineups skipped");
    expect(out).toContain("reason one");
    expect(out).toContain("reason two");
    expect(out).not.toContain("reason three");
    expect(out).toContain("(+2 more)");
  });
});
