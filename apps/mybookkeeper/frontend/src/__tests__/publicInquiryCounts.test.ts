import { describe, expect, it } from "vitest";
import { INITIAL_FORM, validateForm } from "@/app/features/public-inquiry/public-inquiry-helpers";

const withCounts = (occupantCount: string, vehicleCount: string) =>
  validateForm({ ...INITIAL_FORM, occupantCount, vehicleCount });

describe("public inquiry occupant and vehicle counts", () => {
  it("accepts the defaults and the schema bounds", () => {
    expect(withCounts("1", "0").occupantCount).toBeUndefined();
    expect(withCounts("10", "10").vehicleCount).toBeUndefined();
  });

  it.each(["2.5", "1.5"])("rejects a decimal occupant count %s instead of truncating", (v) => {
    expect(withCounts(v, "0").occupantCount).toMatch(/whole number/);
  });

  it.each(["0", "-1"])("rejects occupants %s as below 1", (v) => {
    expect(withCounts(v, "0").occupantCount).toMatch(/at least 1/);
  });

  it("rejects 11 occupants and blank occupants", () => {
    expect(withCounts("11", "0").occupantCount).toMatch(/Maximum is 10/);
    expect(withCounts("", "0").occupantCount).toMatch(/enter the number of occupants/);
  });

  it("rejects a decimal vehicle count", () => {
    expect(withCounts("1", "1.5").vehicleCount).toMatch(/whole number/);
  });

  it("rejects negative and over-limit vehicle counts", () => {
    expect(withCounts("1", "-1").vehicleCount).toMatch(/negative/);
    expect(withCounts("1", "11").vehicleCount).toMatch(/Maximum is 10/);
  });

  it("requires vehicles to be filled in (0 is allowed)", () => {
    expect(withCounts("1", "").vehicleCount).toMatch(/or 0/);
  });
});
