/**
 * The "Assign vendor" dropdown on the transaction editor, against the real RTK Query hooks and a server
 * stub that answers a page of vendors at a time: every vendor can be picked, and an assigned vendor on a
 * later page still shows its name.
 */
import { afterEach, describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm, useWatch } from "react-hook-form";
import type { Transaction } from "@mybookkeeper/api-client/types/transaction/transaction";
import type { VendorSummary } from "@mybookkeeper/api-client/types/vendor/vendor-summary";
import TransactionForm from "@/app/features/transactions/TransactionForm";
import type { TransactionFormValues } from "@/shared/types/transaction/transaction-form-values";
import { restoreApi, stubApi } from "@/test/api-stub";
import { answerListPage } from "@/test/paged-list-server";
import { renderWithStore } from "@/test/render-with-store";
import { NO_FINANCIAL_ACCOUNTS } from "@/test/empty-financial-accounts";

const PAGE_SIZE = 25;
const VENDOR_COUNT = PAGE_SIZE + 5;
const CREATED = "2026-04-25T10:00:00Z";

const VENDORS: VendorSummary[] = Array.from({ length: VENDOR_COUNT }, (_, i) => ({
  id: `vendor-${i + 1}`,
  organization_id: "org-1",
  user_id: "user-1",
  name: `Vendor ${i + 1}`,
  category: "plumber",
  phone: null,
  hourly_rate: null,
  preferred: false,
  last_used_at: null,
  created_at: CREATED,
  updated_at: CREATED,
}));

function transactionWith(vendorId: string | null): Transaction {
  return {
    id: "txn-1",
    vendor: "Roofer",
    vendor_id: vendorId,
    amount: "420.00",
    transaction_type: "expense",
    category: "maintenance",
    transaction_date: "2026-02-20",
    status: "approved",
    review_reason: null,
    source_document_id: null,
    source_file_name: null,
    schedule_e_line: null,
    tags: [],
  } as unknown as Transaction;
}

function FormHarness({ transaction }: { transaction: Transaction }) {
  const form = useForm<TransactionFormValues>({ defaultValues: { vendor_id: transaction.vendor_id ?? "" } });
  const vendorId = useWatch({ control: form.control, name: "vendor_id" });
  return (
    <>
      <TransactionForm
        transaction={transaction}
        properties={[]}
        register={form.register}
        watch={form.watch}
        setValue={form.setValue}
        dirtyFields={form.formState.dirtyFields}
        onSubmit={(event) => event.preventDefault()}
        dupOther={null}
      />
      <output data-testid="form-vendor-id">{vendorId}</output>
    </>
  );
}

let cleanup: () => void = () => undefined;
let singleVendorReads: string[] = [];

function renderForm(vendorId: string | null): void {
  singleVendorReads = [];
  stubApi((path, params) => {
    if (path === "/vendors") return answerListPage(VENDORS, params);
    if (path === "/financial-accounts") return NO_FINANCIAL_ACCOUNTS;
    const id = path.split("/")[2];
    singleVendorReads.push(id);
    return VENDORS.find((vendor) => vendor.id === id);
  });
  cleanup = renderWithStore(<FormHarness transaction={transactionWith(vendorId)} />, "/transactions");
}

async function vendorSelect(): Promise<HTMLSelectElement> {
  return (await screen.findByTestId("vendor-id-select")) as HTMLSelectElement;
}

afterEach(() => {
  cleanup();
  restoreApi();
});

describe("Assign vendor dropdown", () => {
  it("offers only the first page of vendors until Load more, then lets a page 2 vendor be picked", async () => {
    renderForm(null);
    const select = await vendorSelect();
    expect(screen.queryByRole("option", { name: "Vendor 30" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Load more" }));
    await userEvent.selectOptions(select, await screen.findByRole("option", { name: "Vendor 30" }));

    expect(select.value).toBe("vendor-30");
    expect(screen.getByTestId("form-vendor-id")).toHaveTextContent("vendor-30");
  });

  it("names an assigned vendor that isn't on the first page, by reading it on its own", async () => {
    renderForm("vendor-30");
    const select = await vendorSelect();

    await waitFor(() => expect(select.selectedOptions[0]).toHaveTextContent("Vendor 30"));
    expect(singleVendorReads).toEqual(["vendor-30"]);
    expect(screen.getByTestId("form-vendor-id")).toHaveTextContent("vendor-30");
  });

  it("reads no extra vendor when the assigned one is on the first page", async () => {
    renderForm("vendor-3");
    const select = await vendorSelect();

    await waitFor(() => expect(select.selectedOptions[0]).toHaveTextContent("Vendor 3"));
    expect(singleVendorReads).toEqual([]);
  });
});
