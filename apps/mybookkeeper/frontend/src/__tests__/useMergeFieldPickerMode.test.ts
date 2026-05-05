import { describe, it, expect } from "vitest";
import { useMergeFieldPickerMode } from "@/app/features/transactions/useMergeFieldPickerMode";
import type { MergeableField } from "@/app/features/transactions/merge-defaults";

describe("useMergeFieldPickerMode", () => {
  it("returns 'no-conflicts' when visibleFields is empty", () => {
    expect(useMergeFieldPickerMode({ visibleFields: [] })).toBe("no-conflicts");
  });

  it("returns 'date-only' when only transaction_date differs", () => {
    const fields: MergeableField[] = ["transaction_date"];
    expect(useMergeFieldPickerMode({ visibleFields: fields })).toBe("date-only");
  });

  it("returns 'conflicts' when multiple fields differ", () => {
    const fields: MergeableField[] = ["transaction_date", "vendor"];
    expect(useMergeFieldPickerMode({ visibleFields: fields })).toBe("conflicts");
  });

  it("returns 'conflicts' when a single non-date field differs", () => {
    const fields: MergeableField[] = ["vendor"];
    expect(useMergeFieldPickerMode({ visibleFields: fields })).toBe("conflicts");
  });

  it("returns 'conflicts' when amount and vendor differ", () => {
    const fields: MergeableField[] = ["amount", "vendor"];
    expect(useMergeFieldPickerMode({ visibleFields: fields })).toBe("conflicts");
  });
});
