import { afterEach, describe, expect, it, vi } from "vitest";
import { tenancyState } from "../utils/tenancyState";

const TODAY = "2026-11-04";

describe("tenancyState", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("is active with no end and a lease still running", () => {
    expect(tenancyState({ tenant_ended_at: null, contract_end: "2027-01-01" }, TODAY)).toBe("active");
    expect(tenancyState({ tenant_ended_at: null, contract_end: null }, TODAY)).toBe("active");
  });

  it("is still active on the lease's last day", () => {
    expect(tenancyState({ tenant_ended_at: null, contract_end: TODAY }, TODAY)).toBe("active");
  });

  it("is ended when the host ended it", () => {
    expect(tenancyState({ tenant_ended_at: "2026-10-03T12:00:00Z", contract_end: "2027-01-01" }, TODAY)).toBe("ended");
  });

  it("is expired once the lease has run out", () => {
    expect(tenancyState({ tenant_ended_at: null, contract_end: "2026-11-03" }, TODAY)).toBe("expired");
  });

  it("calls it expired when both apply, because restarting wouldn't bring them back", () => {
    expect(tenancyState({ tenant_ended_at: "2026-10-03T12:00:00Z", contract_end: "2026-11-03" }, TODAY)).toBe("expired");
  });

  it("defaults to the local date, not UTC", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 4, 23, 30));
    expect(tenancyState({ tenant_ended_at: null, contract_end: "2026-11-04" })).toBe("active");
  });
});
