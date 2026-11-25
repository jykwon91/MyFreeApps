/**
 * Against the real RTK Query hooks: the tenant and applicant dropdowns list everyone, not just the first
 * page. A person past page 1 is reached with Load more and can be picked, and a tenant already linked who
 * isn't on a loaded page still shows by name.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AttributeTenantPicker from "@/app/features/transactions/AttributeTenantPicker";
import AttributionReviewItem from "@/app/features/attribution/AttributionReviewItem";
import LeaseImportDialog from "@/app/features/leases/LeaseImportDialog";
import type { AttributionReviewItem as ReviewItemType } from "@mybookkeeper/api-client/types/attribution/attribution-review-item";
import { restoreApi, stubApi } from "@/test/api-stub";
import { renderWithStore } from "@/test/render-with-store";

function person(n: number) {
  return {
    id: `person-${n}`,
    legal_name: `Person ${n}`,
    stage: "lease_signed",
    tenant_ended_at: null,
    contract_end: null,
    created_at: "2026-01-01T00:00:00Z",
  };
}

const PAGE_ONE = { items: [person(1), person(2)], total: 3, has_more: true };
const PAGE_TWO = { items: [person(3)], total: 3, has_more: false };

const UNMATCHED_RENT: ReviewItemType = {
  id: "rev-1",
  transaction_id: "txn-1",
  proposed_applicant_id: null,
  proposed_property_id: null,
  confidence: "unmatched",
  status: "pending",
  created_at: "2026-05-01T10:00:00Z",
  resolved_at: null,
  transaction: {
    id: "txn-1",
    transaction_date: "2026-05-01",
    amount: "1500.00",
    vendor: null,
    payer_name: "Someone",
    description: null,
    property_id: null,
    channel: null,
  },
  proposed_applicant: null,
  proposed_property: null,
};

let cleanup: () => void = () => undefined;

afterEach(() => {
  cleanup();
  restoreApi();
});

/** Serves `listPath` a page at a time and one person by id. Returns every path and offset asked for. */
function servePeople(listPath: string): { paths: string[]; offsets: number[] } {
  const asked = { paths: [] as string[], offsets: [] as number[] };
  stubApi((path, params) => {
    asked.paths.push(path);
    if (path === listPath) {
      const offset = Number(params.offset ?? 0);
      asked.offsets.push(offset);
      return offset === 0 ? PAGE_ONE : PAGE_TWO;
    }
    if (path === "/applicants/person-3") return person(3);
    if (path === "/listings") return { items: [], total: 0, has_more: false };
    if (path === "/properties") return [];
    return { ok: true, transaction_id: "txn-1" };
  });
  return asked;
}

const options = (select: HTMLElement) => Array.from((select as HTMLSelectElement).options).map((option) => option.textContent);

/** The Load more under a dropdown: a dialog can hold more than one paged dropdown. */
const loadMoreUnder = (select: HTMLElement) => within(select.closest("div.space-y-2") as HTMLElement).getByTestId("load-more-button");

describe("the transaction's Attribute to tenant dropdown", () => {
  it("reaches a tenant past the first page with Load more and links the payment to them", async () => {
    const asked = servePeople("/applicants/tenants");
    cleanup = renderWithStore(<AttributeTenantPicker transactionId="txn-1" currentApplicantId={null} currentAttributionSource={null} />, "/");
    const select = await screen.findByRole("combobox", { name: /select tenant/i });
    expect(options(select)).not.toContain("Person 3");

    await userEvent.click(loadMoreUnder(select));
    await screen.findByRole("option", { name: "Person 3" });
    await userEvent.selectOptions(select, "person-3");
    await userEvent.click(screen.getByRole("button", { name: /^Link$/ }));

    await waitFor(() => expect(asked.paths).toContain("/transactions/txn-1/attribute"));
    expect(asked.offsets).toEqual([0, 25]);
  });

  it("shows a linked tenant who isn't on the first page by name, selected", async () => {
    servePeople("/applicants/tenants");
    cleanup = renderWithStore(<AttributeTenantPicker transactionId="txn-1" currentApplicantId="person-3" currentAttributionSource="manual" />, "/");

    const select = (await screen.findByRole("combobox", { name: /select tenant/i })) as HTMLSelectElement;
    await screen.findByRole("option", { name: "Person 3" });
    expect(select.value).toBe("person-3");
  });
});

describe("the review queue's tenant dropdown", () => {
  it("reaches a tenant past the first page with Load more and links the payment to them", async () => {
    const asked = servePeople("/applicants/tenants");
    cleanup = renderWithStore(<AttributionReviewItem item={UNMATCHED_RENT} />, "/");
    const select = await screen.findByRole("combobox", { name: /pick a tenant/i });

    await userEvent.click(loadMoreUnder(select));
    await screen.findByRole("option", { name: "Person 3" });
    await userEvent.selectOptions(select, "person-3");
    await userEvent.click(screen.getByRole("button", { name: /^Link$/ }));

    await waitFor(() => expect(asked.paths).toContain("/transactions/txn-1/attribute"));
  });
});

describe("the Import signed lease applicant dropdown", () => {
  it("reaches an applicant past the first page with Load more", async () => {
    const asked = servePeople("/applicants");
    cleanup = renderWithStore(<LeaseImportDialog onClose={vi.fn()} />, "/leases");
    const select = (await screen.findByTestId("import-applicant-select")) as HTMLSelectElement;
    await screen.findByRole("option", { name: "Person 2" });
    expect(options(select)).not.toContain("Person 3");

    await userEvent.click(loadMoreUnder(select));
    await screen.findByRole("option", { name: "Person 3" });
    await userEvent.selectOptions(select, "person-3");

    expect(select.value).toBe("person-3");
    expect(asked.offsets).toEqual([0, 25]);
  });
});
