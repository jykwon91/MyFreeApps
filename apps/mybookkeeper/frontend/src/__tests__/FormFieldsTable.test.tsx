import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FormFieldsTable from "@/app/features/tax/FormFieldsTable";
import type { TaxFormField } from "@mybookkeeper/api-client/types/tax/TaxFormField";
import { TAX_FIELD_OVERRIDE_PROBLEMS } from "@mybookkeeper/api-client/constants/taxFieldOverride";

vi.mock("@/app/features/documents/DocumentViewer", () => ({ default: () => null }));

function field(overrides: Partial<TaxFormField> = {}): TaxFormField {
  return {
    id: "f1",
    field_id: "line_3",
    label: "Rents received",
    value: 24000,
    type: "numeric",
    is_calculated: false,
    is_overridden: false,
    validation_status: "valid",
    validation_message: null,
    confidence: null,
    ...overrides,
  };
}

function renderTable(fields: TaxFormField[], { canOverride = true, onOverride = vi.fn().mockResolvedValue(true) } = {}) {
  render(
    <FormFieldsTable
      fields={fields}
      instanceLabel={null}
      sourceType="computed"
      onOverride={onOverride}
      isSaving={false}
      canOverride={canOverride}
    />,
  );
  return onOverride;
}

async function startEdit() {
  await userEvent.click(screen.getByTitle("Override value"));
}

describe("FormFieldsTable", () => {
  it("shows an unreadable number as an error on its field instead of turning it into blank", async () => {
    const onOverride = renderTable([field()]);
    await startEdit();
    const input = screen.getByDisplayValue("24000");
    expect(input).toHaveAttribute("type", "text");
    expect(input).toHaveAttribute("inputmode", "decimal");
    await userEvent.clear(input);
    await userEvent.type(input, "1e3");
    await userEvent.type(screen.getByPlaceholderText("Reason for override..."), "Typo");
    await userEvent.click(screen.getByText("Save"));
    expect(screen.getByText(TAX_FIELD_OVERRIDE_PROBLEMS.number)).toBeInTheDocument();
    expect(onOverride).not.toHaveBeenCalled();
  });

  it("reads what people type, like $1,250.50, and sends it tied to the field's type", async () => {
    const onOverride = renderTable([field()]);
    await startEdit();
    const input = screen.getByDisplayValue("24000");
    await userEvent.clear(input);
    await userEvent.type(input, "$1,250.50");
    await userEvent.type(screen.getByPlaceholderText("Reason for override..."), " Closing statement ");
    await userEvent.click(screen.getByText("Save"));
    expect(onOverride).toHaveBeenCalledWith("f1", { field_type: "numeric", value: 1250.5 }, "Closing statement");
  });

  it("never pre-fills a hidden identifying number, and refuses to save a hidden value", async () => {
    const onOverride = renderTable([field({ field_id: "recipient_tin", type: "text", value: "12-3456789", label: "Recipient TIN" })]);
    await startEdit();
    const input = screen.getAllByRole("textbox")[0];
    expect(input).toHaveValue("");
    await userEvent.type(input, "***6789");
    await userEvent.type(screen.getByPlaceholderText("Reason for override..."), "Typo");
    await userEvent.click(screen.getByText("Save"));
    expect(screen.getByText(TAX_FIELD_OVERRIDE_PROBLEMS.masked)).toBeInTheDocument();
    expect(onOverride).not.toHaveBeenCalled();
  });

  it("hides the override pencil from anyone but an owner or admin", () => {
    renderTable([field()], { canOverride: false });
    expect(screen.queryByTitle("Override value")).not.toBeInTheDocument();
  });

  it.each(["recipient_tin", "ssn", "account_number", "issuer_ein"])("starts %s empty instead of the masked value", async (fieldId) => {
    renderTable([field({ field_id: fieldId, type: "text", value: "***6789" })]);
    await startEdit();
    expect(screen.getAllByRole("textbox")[0]).toHaveValue("");
  });

  it("does not pre-fill a non-PII value that contains a mask token", async () => {
    renderTable([field({ field_id: "box_14", type: "text", value: "SSN ***-**-6789" })]);
    await startEdit();
    expect(screen.getAllByRole("textbox")[0]).toHaveValue("");
  });

  it("sends null for a blank yes or no instead of false", async () => {
    const onOverride = renderTable([field({ type: "boolean", value: true })]);
    await startEdit();
    await userEvent.clear(screen.getAllByRole("textbox")[0]);
    await userEvent.type(screen.getByPlaceholderText("Reason for override..."), "Unchecked");
    await userEvent.click(screen.getByText("Save"));
    expect(onOverride).toHaveBeenCalledWith("f1", { field_type: "boolean", value: null }, "Unchecked");
  });

  it("sends null to clear a blank number", async () => {
    const onOverride = renderTable([field()]);
    await startEdit();
    await userEvent.clear(screen.getByDisplayValue("24000"));
    await userEvent.type(screen.getByPlaceholderText("Reason for override..."), "Not on the form");
    await userEvent.click(screen.getByText("Save"));
    expect(onOverride).toHaveBeenCalledWith("f1", { field_type: "numeric", value: null }, "Not on the form");
  });

  it("sends the typed full value for a PII field", async () => {
    const onOverride = renderTable([field({ field_id: "ssn", type: "text", value: "***6789" })]);
    await startEdit();
    await userEvent.type(screen.getAllByRole("textbox")[0], "123-45-6789");
    await userEvent.type(screen.getByPlaceholderText("Reason for override..."), "Typo");
    await userEvent.click(screen.getByText("Save"));
    expect(onOverride).toHaveBeenCalledWith("f1", { field_type: "text", value: "123-45-6789" }, "Typo");
  });

  it("keeps the editor open when the server rejects the override, and closes it when accepted", async () => {
    const onOverride = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    renderTable([field()], { onOverride });
    await startEdit();
    await userEvent.type(screen.getByPlaceholderText("Reason for override..."), "Fix");
    await userEvent.click(screen.getByText("Save"));
    await waitFor(() => expect(onOverride).toHaveBeenCalledTimes(1));
    expect(screen.getByDisplayValue("24000")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Reason for override...")).toHaveValue("Fix");
    await userEvent.click(screen.getByText("Save"));
    await waitFor(() => expect(screen.queryByDisplayValue("24000")).toBeNull());
  });

  it("does not save without a reason", async () => {
    renderTable([field()]);
    await startEdit();
    expect(screen.getByText("Save")).toBeDisabled();
  });
});
