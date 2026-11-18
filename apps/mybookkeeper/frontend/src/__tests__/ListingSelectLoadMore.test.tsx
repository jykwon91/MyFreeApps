/**
 * Against the real RTK Query hooks: the listing dropdowns (here the New Inquiry form's) reach listings past
 * the first page with Load more, keep the ones already loaded when a Load more fails, and keep a pick
 * made on page 1 selected after page 2 loads.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import InquiryForm from "@/app/features/inquiries/InquiryForm";
import type { ListingSummary } from "@mybookkeeper/api-client/types/listing/listing-summary";
import { restoreApi, stubApi } from "@/test/api-stub";
import { renderWithStore } from "@/test/render-with-store";

function listing(n: number): ListingSummary {
  return {
    id: `listing-${n}`,
    title: `Room ${n}`,
    status: "active",
    room_type: "private_room",
    monthly_rate: "1500.00",
    property_id: "prop-1",
    created_at: "2026-01-01T00:00:00Z",
    slug: `room-${n}`,
  };
}

const PAGE_ONE = { items: [listing(1), listing(2)], total: 3, has_more: true };
const PAGE_TWO = { items: [listing(3)], total: 3, has_more: false };
const LOAD_MORE_ERROR = /couldn't load more listings/i;

let cleanup: () => void = () => undefined;

afterEach(() => {
  cleanup();
  restoreApi();
});

/** Serves page 1, then page 2 (failing the first `failuresOnPageTwo` times). Returns the offsets asked for. */
function serveListings(failuresOnPageTwo = 0): number[] {
  const offsets: number[] = [];
  let failures = failuresOnPageTwo;
  stubApi((path, params) => {
    if (path !== "/listings") return {};
    const offset = Number(params.offset ?? 0);
    offsets.push(offset);
    if (offset === 0) return PAGE_ONE;
    if (failures > 0) {
      failures -= 1;
      throw new Error("server down");
    }
    return PAGE_TWO;
  });
  return offsets;
}

function renderForm(): void {
  cleanup = renderWithStore(<InquiryForm onClose={vi.fn()} />, "/inquiries");
}

const listingSelect = () => screen.getByTestId("inquiry-form-listing") as HTMLSelectElement;
const optionValues = () => Array.from(listingSelect().options).map((option) => option.value);

describe("the New Inquiry form's listing dropdown", () => {
  it("reaches a listing past the first page with Load more", async () => {
    const offsets = serveListings();
    renderForm();
    expect(await screen.findByRole("option", { name: "Room 2" })).toBeInTheDocument();
    expect(optionValues()).not.toContain("listing-3");

    await userEvent.click(screen.getByTestId("load-more-button"));
    expect(await screen.findByRole("option", { name: "Room 3" })).toBeInTheDocument();
    await userEvent.selectOptions(listingSelect(), "listing-3");

    expect(listingSelect().value).toBe("listing-3");
    expect(optionValues()).toEqual(["", "listing-1", "listing-2", "listing-3"]);
    expect(screen.queryByTestId("load-more-button")).not.toBeInTheDocument();
    expect(offsets).toContain(25);
  });

  it("keeps a listing picked on page 1 selected after page 2 loads", async () => {
    serveListings();
    renderForm();
    await screen.findByRole("option", { name: "Room 2" });
    await userEvent.selectOptions(listingSelect(), "listing-1");

    await userEvent.click(screen.getByTestId("load-more-button"));
    await screen.findByRole("option", { name: "Room 3" });

    expect(listingSelect().value).toBe("listing-1");
  });

  it("keeps the loaded listings when Load more fails and loads the page on Retry", async () => {
    serveListings(1);
    renderForm();
    await screen.findByRole("option", { name: "Room 2" });

    await userEvent.click(screen.getByTestId("load-more-button"));

    expect(await screen.findByText(LOAD_MORE_ERROR)).toBeInTheDocument();
    expect(optionValues()).toEqual(["", "listing-1", "listing-2"]);

    await userEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByRole("option", { name: "Room 3" })).toBeInTheDocument();
    expect(screen.queryByText(LOAD_MORE_ERROR)).not.toBeInTheDocument();
  });
});
