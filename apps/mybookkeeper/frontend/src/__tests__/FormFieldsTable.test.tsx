import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import FormFieldsTable from "@/app/features/tax/FormFieldsTable";
import type { TaxFormField } from "@/shared/types/tax/tax-form";

function makeField(overrides: Partial<TaxFormField>): TaxFormField {
  return {
    id: "f1",
    field_id: "box_1",
    label: "Wages",
    value: 1200,
    type: "numeric",
    is_calculated: false,
    is_overridden: false,
    validation_status: "unvalidated",
    validation_message: null,
    confidence: null,
    ...overrides,
  };
}

function renderTable(field: TaxFormField, onOverride = vi.fn()) {
  render(
    <FormFieldsTable
      fields={[field]}
      instanceLabel={null}
      sourceType="extracted"
      onOverride={onOverride}
      isSaving={false}
    />,
  );
  fireEvent.click(screen.getByTitle("Override value"));
  return onOverride;
}

describe("FormFieldsTable override editing", () => {
  it("pre-fills a non-PII field with its current value", () => {
    renderTable(makeField({}));
    expect(screen.getByRole("spinbutton")).toHaveValue(1200);
  });

  it.each(["recipient_tin", "ssn", "account_number", "issuer_ein"])(
    "starts %s empty instead of the masked value",
    (fieldId) => {
      renderTable(makeField({ field_id: fieldId, type: "text", value: "***6789" }));
      const [valueInput] = screen.getAllByRole("textbox");
      expect(valueInput).toHaveValue("");
    },
  );

  it("sends null to clear a blank number", () => {
    const onOverride = renderTable(makeField({}));
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "" } });
    fireEvent.change(screen.getByPlaceholderText("Reason for override..."), {
      target: { value: "Not on the form" },
    });
    fireEvent.click(screen.getByText("Save"));
    expect(onOverride).toHaveBeenCalledWith("f1", null, "Not on the form", "numeric");
  });

  it("sends the typed full value for a PII field", () => {
    const onOverride = renderTable(
      makeField({ field_id: "ssn", type: "text", value: "***6789" }),
    );
    const [valueInput] = screen.getAllByRole("textbox");
    fireEvent.change(valueInput, { target: { value: "123-45-6789" } });
    fireEvent.change(screen.getByPlaceholderText("Reason for override..."), {
      target: { value: "Typo" },
    });
    fireEvent.click(screen.getByText("Save"));
    expect(onOverride).toHaveBeenCalledWith("f1", "123-45-6789", "Typo", "text");
  });

  it("does not save without a reason", () => {
    renderTable(makeField({}));
    expect(screen.getByText("Save")).toBeDisabled();
  });
});
