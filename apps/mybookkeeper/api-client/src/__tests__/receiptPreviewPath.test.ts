import { afterEach, describe, expect, it, vi } from "vitest";
import { receiptPreviewPath } from "../utils/receiptPreviewPath";

describe("receiptPreviewPath", () => {
  afterEach(() => vi.useRealTimers());

  it("sends the host's local date, not the UTC one", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 6, 23, 30));
    expect(receiptPreviewPath("t1", { periodStart: "2026-11-01", periodEnd: "2026-11-30", paymentMethod: "zelle" })).toBe(
      "/rent-receipts/preview/t1?period_start=2026-11-01&period_end=2026-11-30&payment_method=zelle&today=2026-11-06",
    );
  });

  it("leaves an empty payment method off", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 6, 9, 0));
    expect(receiptPreviewPath("t1", { periodStart: "2026-11-01", periodEnd: "2026-11-30", paymentMethod: "" })).toBe(
      "/rent-receipts/preview/t1?period_start=2026-11-01&period_end=2026-11-30&today=2026-11-06",
    );
  });
});
