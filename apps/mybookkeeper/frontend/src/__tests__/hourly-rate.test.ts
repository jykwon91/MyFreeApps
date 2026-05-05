import { describe, it, expect } from "vitest";
import { formatHourlyRate } from "@/shared/utils/hourly-rate";

describe("formatHourlyRate", () => {
  it("formats a numeric string as currency with /hr suffix", () => {
    expect(formatHourlyRate("45")).toBe("$45.00/hr");
    expect(formatHourlyRate("45.50")).toBe("$45.50/hr");
    expect(formatHourlyRate("0")).toBe("$0.00/hr");
  });

  it("rounds to two decimal places", () => {
    expect(formatHourlyRate("45.555")).toBe("$45.56/hr");
    expect(formatHourlyRate("45.554")).toBe("$45.55/hr");
  });

  it("returns em-dash for null", () => {
    expect(formatHourlyRate(null)).toBe("—");
  });

  it("returns em-dash for undefined", () => {
    expect(formatHourlyRate(undefined)).toBe("—");
  });

  it("returns em-dash for non-numeric strings", () => {
    expect(formatHourlyRate("abc")).toBe("—");
    expect(formatHourlyRate("")).toBe("—");
  });
});
