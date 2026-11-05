import { describe, it, expect } from "vitest";
import { formatHourlyRate } from "@/shared/utils/hourly-rate";

describe("formatHourlyRate", () => {
  it("adds /hr, with cents only when there are some", () => {
    expect(formatHourlyRate("45")).toBe("$45/hr");
    expect(formatHourlyRate("45.00")).toBe("$45/hr");
    expect(formatHourlyRate("45.50")).toBe("$45.50/hr");
    expect(formatHourlyRate("0")).toBe("$0/hr");
    expect(formatHourlyRate("1250")).toBe("$1,250/hr");
  });

  it("rounds to the cent", () => {
    expect(formatHourlyRate("45.555")).toBe("$45.56/hr");
    expect(formatHourlyRate("45.554")).toBe("$45.55/hr");
  });

  it.each([null, undefined, "", "abc"])("shows a dash for %j", (rate) => {
    expect(formatHourlyRate(rate)).toBe("—");
  });
});
