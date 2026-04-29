import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { store } from "@/shared/store";
import VendorDetail from "@/app/pages/VendorDetail";
import type { VendorResponse } from "@/shared/types/vendor/vendor-response";

const mockVendor: VendorResponse = {
  id: "vendor-1",
  organization_id: "org-1",
  user_id: "user-1",
  name: "Bob's Plumbing",
  category: "plumber",
  phone: "555-0101",
  email: "bob@plumbing.example.com",
  address: "123 Main St\nHouston, TX",
  hourly_rate: "125.00",
  flat_rate_notes: "Flat $200 for drain unclog",
  preferred: true,
  notes: "Reliable. Same-day for emergencies.",
  last_used_at: "2026-04-01T10:00:00Z",
  created_at: "2026-01-15T10:00:00Z",
  updated_at: "2026-04-01T10:00:00Z",
};

const defaultDetailState = {
  data: mockVendor,
  isLoading: false,
  isFetching: false,
  isError: false,
  refetch: vi.fn(),
};

const deleteVendor = vi.fn(() => ({ unwrap: () => Promise.resolve() }));
const updateVendor = vi.fn(() => ({ unwrap: () => Promise.resolve(mockVendor) }));
const createVendor = vi.fn(() => ({ unwrap: () => Promise.resolve(mockVendor) }));

vi.mock("@/shared/store/vendorsApi", () => ({
  useGetVendorsQuery: vi.fn(() => ({ data: undefined, isLoading: false })),
  useGetVendorByIdQuery: vi.fn(() => defaultDetailState),
  useDeleteVendorMutation: () => [deleteVendor, { isLoading: false }],
  useUpdateVendorMutation: () => [updateVendor, { isLoading: false }],
  useCreateVendorMutation: () => [createVendor, { isLoading: false }],
}));

import { useGetVendorByIdQuery } from "@/shared/store/vendorsApi";

type DetailQueryReturn = ReturnType<typeof useGetVendorByIdQuery>;

function renderVendorDetail(vendorId = "vendor-1") {
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[`/vendors/${vendorId}`]}>
        <Routes>
          <Route path="/vendors/:vendorId" element={<VendorDetail />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
}

describe("VendorDetail page", () => {
  beforeEach(() => {
    vi.mocked(useGetVendorByIdQuery).mockReturnValue(
      defaultDetailState as unknown as DetailQueryReturn,
    );
  });

  it("renders the vendor name as the heading and the back link", () => {
    renderVendorDetail();
    expect(
      screen.getByRole("heading", { name: "Bob's Plumbing" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Back to vendors/i })).toBeInTheDocument();
  });

  it("renders the preferred indicator when preferred=true", () => {
    renderVendorDetail();
    expect(screen.getByTestId("vendor-preferred-indicator")).toBeInTheDocument();
  });

  it("hides the preferred indicator when preferred=false", () => {
    vi.mocked(useGetVendorByIdQuery).mockReturnValueOnce({
      ...defaultDetailState,
      data: { ...mockVendor, preferred: false },
    } as unknown as DetailQueryReturn);
    renderVendorDetail();
    expect(screen.queryByTestId("vendor-preferred-indicator")).toBeNull();
  });

  it("renders contact info as tel:/mailto: links and the address", () => {
    renderVendorDetail();
    const phoneCell = screen.getByTestId("vendor-phone");
    expect(phoneCell).toHaveTextContent("555-0101");
    expect(phoneCell.querySelector("a")?.getAttribute("href")).toBe("tel:555-0101");

    const emailCell = screen.getByTestId("vendor-email");
    expect(emailCell).toHaveTextContent("bob@plumbing.example.com");
    expect(emailCell.querySelector("a")?.getAttribute("href")).toBe(
      "mailto:bob@plumbing.example.com",
    );

    expect(screen.getByTestId("vendor-address")).toHaveTextContent(/123 Main St/);
  });

  it("renders the formatted hourly rate and flat-rate notes", () => {
    renderVendorDetail();
    expect(screen.getByTestId("vendor-hourly-rate")).toHaveTextContent("$125.00 / hour");
    expect(screen.getByTestId("vendor-flat-rate-notes")).toHaveTextContent(
      /Flat \$200 for drain unclog/,
    );
  });

  it("renders the host notes", () => {
    renderVendorDetail();
    expect(screen.getByTestId("vendor-notes")).toHaveTextContent(/Reliable/);
  });

  it("renders the loading skeleton while fetching", () => {
    vi.mocked(useGetVendorByIdQuery).mockReturnValueOnce({
      ...defaultDetailState,
      data: undefined,
      isLoading: true,
    } as unknown as DetailQueryReturn);
    renderVendorDetail();
    expect(screen.getByTestId("vendor-detail-skeleton")).toBeInTheDocument();
  });

  it("renders the friendly not-found message on error", () => {
    vi.mocked(useGetVendorByIdQuery).mockReturnValueOnce({
      ...defaultDetailState,
      data: undefined,
      isError: true,
    } as unknown as DetailQueryReturn);
    renderVendorDetail();
    expect(
      screen.getByText(/I couldn't find that vendor/i),
    ).toBeInTheDocument();
  });

  it("falls back to '—' for missing optional contact fields", () => {
    vi.mocked(useGetVendorByIdQuery).mockReturnValueOnce({
      ...defaultDetailState,
      data: {
        ...mockVendor,
        phone: null,
        email: null,
        address: null,
        flat_rate_notes: null,
      },
    } as unknown as DetailQueryReturn);
    renderVendorDetail();
    expect(screen.getByTestId("vendor-phone")).toHaveTextContent("—");
    expect(screen.getByTestId("vendor-email")).toHaveTextContent("—");
    expect(screen.getByTestId("vendor-address")).toHaveTextContent("—");
    expect(screen.getByTestId("vendor-flat-rate-notes")).toHaveTextContent("—");
  });

  it("falls back to 'Not set' for missing hourly rate", () => {
    vi.mocked(useGetVendorByIdQuery).mockReturnValueOnce({
      ...defaultDetailState,
      data: { ...mockVendor, hourly_rate: null },
    } as unknown as DetailQueryReturn);
    renderVendorDetail();
    expect(screen.getByTestId("vendor-hourly-rate")).toHaveTextContent("Not set");
  });

  it("renders 'Never used' when last_used_at is null", () => {
    vi.mocked(useGetVendorByIdQuery).mockReturnValueOnce({
      ...defaultDetailState,
      data: { ...mockVendor, last_used_at: null },
    } as unknown as DetailQueryReturn);
    renderVendorDetail();
    expect(screen.getByText(/Never used/i)).toBeInTheDocument();
  });

  // ----- PR 4.2: edit + delete UI -----

  it("opens the edit form when the Edit button is clicked", () => {
    renderVendorDetail();
    expect(screen.queryByTestId("vendor-form")).toBeNull();
    fireEvent.click(screen.getByTestId("edit-vendor-button"));
    expect(screen.getByTestId("vendor-form")).toBeInTheDocument();
    // The name field should be pre-populated with the vendor's name.
    expect(screen.getByTestId("vendor-form-name")).toHaveValue("Bob's Plumbing");
  });

  it("opens the delete confirmation dialog when Delete is clicked", () => {
    renderVendorDetail();
    fireEvent.click(screen.getByTestId("delete-vendor-button"));
    expect(screen.getByText(/Delete this vendor\?/i)).toBeInTheDocument();
    // The vendor name appears multiple places in the dialog + page header;
    // the dialog body must mention it inside the description copy.
    expect(
      screen.getByText(/"Bob's Plumbing" will be removed/i),
    ).toBeInTheDocument();
  });

  it("calls deleteVendor when the user confirms the delete dialog", async () => {
    deleteVendor.mockClear();
    renderVendorDetail();
    fireEvent.click(screen.getByTestId("delete-vendor-button"));
    // ConfirmDialog confirm button has role=button + label "Delete".
    const confirmBtn = screen
      .getAllByRole("button")
      .find((b) => b.textContent === "Delete");
    expect(confirmBtn).toBeDefined();
    fireEvent.click(confirmBtn!);
    await waitFor(() => {
      expect(deleteVendor).toHaveBeenCalledWith("vendor-1");
    });
  });
});
