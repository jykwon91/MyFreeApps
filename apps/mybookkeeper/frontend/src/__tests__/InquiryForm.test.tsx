import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { store } from "@/shared/store";
import InquiryForm from "@/app/features/inquiries/InquiryForm";
import type { ListingSummary } from "@/shared/types/listing/listing-summary";

const mockListings: ListingSummary[] = [
  {
    id: "listing-1",
    title: "Garage Suite A",
    status: "active",
    room_type: "private_room",
    monthly_rate: "1799.00",
    property_id: "prop-1",
    created_at: "2026-01-01T00:00:00Z",
  },
];

const createInquiryMock = vi.fn((_payload: unknown) => ({
  unwrap: () => Promise.resolve({ id: "inq-new" }),
}));

vi.mock("@/shared/store/inquiriesApi", () => ({
  useCreateInquiryMutation: vi.fn(() => [createInquiryMock, { isLoading: false }]),
}));

function renderForm(onClose = vi.fn()) {
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <InquiryForm listings={mockListings} onClose={onClose} />
      </MemoryRouter>
    </Provider>,
  );
}

describe("InquiryForm", () => {
  beforeEach(() => {
    createInquiryMock.mockClear();
  });

  it("renders all fields when source defaults to direct (no external_inquiry_id needed)", () => {
    renderForm();
    expect(screen.getByTestId("inquiry-form-source")).toBeInTheDocument();
    expect(screen.getByTestId("inquiry-form-name")).toBeInTheDocument();
    expect(screen.getByTestId("inquiry-form-email")).toBeInTheDocument();
    expect(screen.getByTestId("inquiry-form-phone")).toBeInTheDocument();
    expect(screen.getByTestId("inquiry-form-employer")).toBeInTheDocument();
    expect(screen.getByTestId("inquiry-form-start-date")).toBeInTheDocument();
    expect(screen.getByTestId("inquiry-form-end-date")).toBeInTheDocument();
    expect(screen.getByTestId("inquiry-form-listing")).toBeInTheDocument();
    expect(screen.getByTestId("inquiry-form-received-at")).toBeInTheDocument();
    expect(screen.getByTestId("inquiry-form-notes")).toBeInTheDocument();
    expect(screen.queryByTestId("inquiry-form-external-id")).not.toBeInTheDocument();
  });

  it("shows the external_inquiry_id field when source is FF", async () => {
    const user = userEvent.setup();
    renderForm();
    const sourceSelect = screen.getByTestId("inquiry-form-source");
    await user.selectOptions(sourceSelect, "FF");
    expect(screen.getByTestId("inquiry-form-external-id")).toBeInTheDocument();
  });

  it("blocks submit when name is empty", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderForm(onClose);
    await user.click(screen.getByTestId("inquiry-form-submit"));
    // The required-field error should surface and the mutation should NOT fire.
    expect(createInquiryMock).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("requires external_inquiry_id when source is FF", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.selectOptions(screen.getByTestId("inquiry-form-source"), "FF");
    await user.type(screen.getByTestId("inquiry-form-name"), "Test User");
    // Leave external-id empty
    await user.click(screen.getByTestId("inquiry-form-submit"));
    expect(createInquiryMock).not.toHaveBeenCalled();
    expect(screen.getByText(/Required for non-direct/i)).toBeInTheDocument();
  });

  it("blocks submit when end-date is before start-date", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByTestId("inquiry-form-name"), "Test User");
    await user.type(screen.getByTestId("inquiry-form-start-date"), "2026-08-01");
    await user.type(screen.getByTestId("inquiry-form-end-date"), "2026-06-01");
    await user.click(screen.getByTestId("inquiry-form-submit"));
    expect(createInquiryMock).not.toHaveBeenCalled();
    expect(screen.getByText(/End date must be on or after start date/i)).toBeInTheDocument();
  });

  it("submits via createInquiry mutation on a happy path (direct source)", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderForm(onClose);
    await user.type(screen.getByTestId("inquiry-form-name"), "Test User");
    await user.type(screen.getByTestId("inquiry-form-email"), "test@example.com");
    await user.click(screen.getByTestId("inquiry-form-submit"));
    await waitFor(() => {
      expect(createInquiryMock).toHaveBeenCalledTimes(1);
    });
    const calls = createInquiryMock.mock.calls;
    expect(calls.length).toBe(1);
    const arg = calls[0][0] as Record<string, unknown>;
    expect(arg.source).toBe("direct");
    expect(arg.inquirer_name).toBe("Test User");
    expect(arg.inquirer_email).toBe("test@example.com");
    expect(arg.received_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("renders all listing options in the listing dropdown", () => {
    renderForm();
    const listingSelect = screen.getByTestId("inquiry-form-listing") as HTMLSelectElement;
    const options = Array.from(listingSelect.options).map((o) => o.value);
    expect(options).toContain("");  // "Not yet linked"
    expect(options).toContain("listing-1");
  });
});
