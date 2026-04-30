import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { store } from "@/shared/store";
import ListingForm from "@/app/features/listings/ListingForm";
import type { ListingResponse } from "@/shared/types/listing/listing-response";
import type { Property } from "@/shared/types/property/property";

const properties: Property[] = [
  {
    id: "prop-1",
    name: "Med Center House",
    address: null,
    classification: "investment",
    type: "long_term",
    is_active: true,
    activity_periods: [],
    created_at: "2025-01-01T00:00:00Z",
  },
];

const createMock = vi.fn(() => ({
  unwrap: () =>
    Promise.resolve({
      id: "new-listing",
      title: "New",
    } as unknown as ListingResponse),
}));
const updateMock = vi.fn(() => ({
  unwrap: () =>
    Promise.resolve({
      id: "listing-1",
      title: "Updated Title",
    } as unknown as ListingResponse),
}));

vi.mock("@/shared/store/listingsApi", () => ({
  useCreateListingMutation: vi.fn(() => [createMock, { isLoading: false }]),
  useUpdateListingMutation: vi.fn(() => [updateMock, { isLoading: false }]),
}));

const sampleListing: ListingResponse = {
  id: "listing-1",
  organization_id: "org",
  user_id: "user",
  property_id: "prop-1",
  title: "Existing Listing",
  description: "Cozy",
  slug: "existing-listing-zzz000",
  monthly_rate: "1500.00",
  weekly_rate: null,
  nightly_rate: null,
  min_stay_days: 30,
  max_stay_days: 90,
  room_type: "private_room",
  private_bath: true,
  parking_assigned: false,
  furnished: true,
  status: "active",
  amenities: ["wifi", "parking"],
  pets_on_premises: false,
  large_dog_disclosure: null,
  photos: [],
  external_ids: [],
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

function renderForm(listing?: ListingResponse) {
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <ListingForm
          listing={listing}
          properties={properties}
          onClose={() => {}}
        />
      </MemoryRouter>
    </Provider>,
  );
}

describe("ListingForm", () => {
  beforeEach(() => {
    createMock.mockClear();
    updateMock.mockClear();
  });

  describe("create mode", () => {
    it("renders empty fields with the New listing heading", () => {
      renderForm();
      expect(screen.getByRole("heading", { name: /new listing/i })).toBeInTheDocument();
      expect(screen.getByTestId("listing-form-title")).toHaveValue("");
      expect(screen.getByTestId("listing-form-monthly-rate")).toHaveValue(null);
    });

    it("requires a title and monthly rate before submit", async () => {
      const user = userEvent.setup();
      renderForm();
      await user.click(screen.getByTestId("listing-form-submit"));
      expect(screen.getByText(/title is required/i)).toBeInTheDocument();
      expect(createMock).not.toHaveBeenCalled();
    });

    it("submits a payload with parsed amenities", async () => {
      const user = userEvent.setup();
      renderForm();

      await user.type(screen.getByTestId("listing-form-title"), "Studio");
      await user.selectOptions(screen.getByTestId("listing-form-property"), "prop-1");
      await user.type(screen.getByTestId("listing-form-monthly-rate"), "1899");
      await user.type(screen.getByTestId("listing-form-amenities"), "wifi, parking, balcony");
      await user.click(screen.getByTestId("listing-form-submit"));

      // Wait a tick for the async mutation
      await new Promise((r) => setTimeout(r, 0));

      expect(createMock).toHaveBeenCalledTimes(1);
      const arg = (createMock.mock.calls[0] as unknown as [Record<string, unknown>])[0];
      expect(arg.title).toBe("Studio");
      expect(arg.property_id).toBe("prop-1");
      expect(arg.monthly_rate).toBe("1899");
      expect(arg.amenities).toEqual(["wifi", "parking", "balcony"]);
      expect(arg.room_type).toBe("private_room");
    });

    it("shows the dog disclosure textarea only when pets_on_premises is checked", async () => {
      const user = userEvent.setup();
      renderForm();
      // hidden initially
      expect(screen.queryByText(/pet\/dog disclosure/i)).not.toBeInTheDocument();
      await user.click(screen.getByTestId("listing-form-pets"));
      expect(screen.getByText(/pet\/dog disclosure/i)).toBeInTheDocument();
    });
  });

  describe("edit mode", () => {
    it("pre-fills fields from the listing", () => {
      renderForm(sampleListing);
      expect(screen.getByRole("heading", { name: /edit listing/i })).toBeInTheDocument();
      expect(screen.getByTestId("listing-form-title")).toHaveValue("Existing Listing");
      expect(screen.getByTestId("listing-form-monthly-rate")).toHaveValue(1500);
      expect(screen.getByTestId("listing-form-amenities")).toHaveValue("wifi, parking");
    });

    it("submits only changed fields", async () => {
      const user = userEvent.setup();
      renderForm(sampleListing);

      const titleInput = screen.getByTestId("listing-form-title");
      await user.clear(titleInput);
      await user.type(titleInput, "Updated Title");
      await user.click(screen.getByTestId("listing-form-submit"));

      await new Promise((r) => setTimeout(r, 0));

      expect(updateMock).toHaveBeenCalledTimes(1);
      const arg = (updateMock.mock.calls[0] as unknown as [{ id: string; data: Record<string, unknown> }])[0];
      expect(arg.id).toBe("listing-1");
      // Only `title` was modified — other fields must be absent (allowlist
      // depends on this for security).
      expect(Object.keys(arg.data)).toEqual(["title"]);
      expect(arg.data.title).toBe("Updated Title");
    });
  });
});
