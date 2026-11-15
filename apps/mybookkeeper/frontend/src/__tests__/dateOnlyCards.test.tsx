import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { formatLocaleDate } from "@/shared/utils/date";
import PaymentDocumentCard from "@/app/features/documents/PaymentDocumentCard";
import type { Transaction } from "@mybookkeeper/api-client/types/transaction/transaction";

describe("date-only fields in a US timezone", () => {
  const originalTz = process.env.TZ;

  beforeAll(() => {
    process.env.TZ = "America/Los_Angeles";
  });

  afterAll(() => {
    process.env.TZ = originalTz;
  });

  it("formatLocaleDate keeps the calendar day", () => {
    expect(formatLocaleDate("2026-11-05")).toBe("11/5/2026");
    expect(formatLocaleDate(null)).toBe("—");
  });

  it("PaymentDocumentCard shows the transaction day, not the day before", () => {
    const transaction = {
      amount: "100.00",
      vendor: "Zelle",
      payer_name: "Pat",
      transaction_date: "2026-11-05",
      payment_method: null,
    } as unknown as Transaction;
    render(<PaymentDocumentCard transaction={transaction} />);
    expect(screen.getByText("11/5/2026")).toBeInTheDocument();
  });
});
