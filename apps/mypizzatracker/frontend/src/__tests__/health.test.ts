import { describe, expect, it } from "vitest";

import {
  HEALTH_LABELS,
  HEALTH_TONES,
} from "@/features/financials/health";

describe("health label/tone tables", () => {
  it("covers every DropHealth value with a label and tone", () => {
    for (const h of ["green", "amber", "red"] as const) {
      expect(typeof HEALTH_LABELS[h]).toBe("string");
      expect(HEALTH_LABELS[h].length).toBeGreaterThan(0);
      expect(typeof HEALTH_TONES[h]).toBe("string");
    }
  });
});

