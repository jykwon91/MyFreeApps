import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import BankStatementImport from "@/app/features/transactions/BankStatementImport";
import { BANK_IMPORT_FAILURE_MESSAGES } from "@mybookkeeper/api-client/constants/bankImport";
import type { ImportResult } from "@mybookkeeper/api-client/types/transaction/ImportResult";

const importBankCsv = vi.fn();
let isLoading = false;
vi.mock("@mybookkeeper/api-client/store/transactionsApi", () => ({
  useImportBankCsvMutation: () => [importBankCsv, { isLoading }],
}));

const RESULT: ImportResult = {
  imported: 3,
  skipped_duplicates: 1,
  format_detected: "chase",
  preview: [{ date: "2026-03-01", vendor: "Home Depot", amount: "84.20", transaction_type: "expense", category: "maintenance" }],
};

function renderImport() {
  const handlers = { onClose: vi.fn(), onSuccess: vi.fn(), onError: vi.fn() };
  const view = render(
    <BankStatementImport properties={[{ id: "p1", name: "Oak Street" } as never]} {...handlers} />,
  );
  const input = view.container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File(["a,b\n"], "statement.csv", { type: "text/csv" })] } });
  return handlers;
}

function resolveWith(value: unknown) {
  importBankCsv.mockReturnValue({ unwrap: () => Promise.resolve(value) });
}

function rejectWith(error: unknown) {
  importBankCsv.mockReturnValue({ unwrap: () => Promise.reject(error) });
}

describe("BankStatementImport", () => {
  beforeEach(() => {
    importBankCsv.mockReset();
    isLoading = false;
  });

  it("keeps Import disabled until a file is chosen", () => {
    render(<BankStatementImport properties={[]} onClose={vi.fn()} onSuccess={vi.fn()} onError={vi.fn()} />);
    expect(screen.getByRole("button", { name: /^import$/i })).toBeDisabled();
  });

  it("sends the file and property through the shared mutation, then shows the preview", async () => {
    resolveWith(RESULT);
    const handlers = renderImport();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "p1" } });
    fireEvent.click(screen.getByRole("button", { name: /^import$/i }));

    await waitFor(() => expect(handlers.onSuccess).toHaveBeenCalledWith("Imported 3 transaction(s), 1 duplicate(s) skipped"));
    const arg = importBankCsv.mock.calls[0][0] as { form: FormData; propertyId?: string };
    expect(arg.propertyId).toBe("p1");
    expect((arg.form.get("file") as File).name).toBe("statement.csv");
    expect(await screen.findByText("Home Depot")).toBeInTheDocument();
  });

  it("sends no property when none is chosen", async () => {
    resolveWith(RESULT);
    renderImport();
    fireEvent.click(screen.getByRole("button", { name: /^import$/i }));
    await waitFor(() => expect(importBankCsv).toHaveBeenCalled());
    expect((importBankCsv.mock.calls[0][0] as { propertyId?: string }).propertyId).toBeUndefined();
  });

  it.each([
    [{ status: 413 }, BANK_IMPORT_FAILURE_MESSAGES.tooLarge],
    [{ status: 422, data: { detail: "No transactions found in CSV" } }, BANK_IMPORT_FAILURE_MESSAGES.unreadable],
    [{ status: 500 }, BANK_IMPORT_FAILURE_MESSAGES.unsure],
  ])("reports a failure (%j) in fixed words", async (error, message) => {
    rejectWith(error);
    const handlers = renderImport();
    fireEvent.click(screen.getByRole("button", { name: /^import$/i }));
    await waitFor(() => expect(handlers.onError).toHaveBeenCalledWith(message));
  });

  it("disables Import while the request is running", () => {
    isLoading = true;
    renderImport();
    expect(screen.getByRole("button", { name: /importing/i })).toBeDisabled();
  });
});
