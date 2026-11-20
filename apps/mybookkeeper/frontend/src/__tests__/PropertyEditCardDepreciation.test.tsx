import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { store } from "@/shared/store";
import PropertyEditCard from "@/app/features/properties/PropertyEditCard";
import { DEPRECIATION_INPUT_MESSAGES } from "@mybookkeeper/api-client/constants/depreciationInputs";
import type { Property } from "@mybookkeeper/api-client/types/property/property";

const rental: Property = {
  id: "prop-1",
  name: "6734 Peerless St, Houston, TX 77021",
  address: "6734 Peerless St, Houston, TX 77021",
  classification: "investment",
  type: "long_term",
  is_active: true,
  purchase_price: "300000.00",
  activity_periods: [],
  created_at: "2026-01-01T00:00:00Z",
};

const updateProperty = vi.fn();

vi.mock("@mybookkeeper/api-client/store/propertiesApi", () => ({
  useUpdatePropertyMutation: vi.fn(() => [updateProperty, { isLoading: false }]),
}));

vi.mock("@/shared/hooks/useToast", () => ({
  useToast: vi.fn(() => ({ showError: vi.fn(), showSuccess: vi.fn() })),
}));

function renderCard(property: Property = rental) {
  return render(
    <Provider store={store}>
      <PropertyEditCard property={property} onDone={vi.fn()} />
    </Provider>,
  );
}

function saveButton() {
  return screen.getByRole("button", { name: /save/i });
}

describe("PropertyEditCard depreciation inputs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateProperty.mockReturnValue({ unwrap: () => Promise.resolve(rental) });
  });

  it("saves a rental's land value and date placed in service", async () => {
    const user = userEvent.setup();
    renderCard();

    await user.type(screen.getByLabelText(DEPRECIATION_INPUT_MESSAGES.landValue), "$25,000");
    await user.type(screen.getByLabelText(DEPRECIATION_INPUT_MESSAGES.placedInService), "2023-03-15");
    await user.click(saveButton());

    await waitFor(() => expect(updateProperty).toHaveBeenCalled());
    const sent = updateProperty.mock.calls[0][0].data;
    expect(sent.land_value).toBe("25000.00");
    expect(sent.date_placed_in_service).toBe("2023-03-15");
  });

  it("shows the saved values and leaves them out when they didn't change", async () => {
    const user = userEvent.setup();
    renderCard({ ...rental, land_value: "25000.00", date_placed_in_service: "2023-03-15" });

    expect(screen.getByLabelText(DEPRECIATION_INPUT_MESSAGES.landValue)).toHaveValue("25000.00");
    expect(screen.getByLabelText(DEPRECIATION_INPUT_MESSAGES.placedInService)).toHaveValue("2023-03-15");
    await user.click(saveButton());

    await waitFor(() => expect(updateProperty).toHaveBeenCalled());
    const sent = updateProperty.mock.calls[0][0].data;
    expect(sent).not.toHaveProperty("land_value");
    expect(sent).not.toHaveProperty("date_placed_in_service");
  });

  it("blocks land worth more than the purchase price", async () => {
    const user = userEvent.setup();
    renderCard();

    await user.type(screen.getByLabelText(DEPRECIATION_INPUT_MESSAGES.landValue), "300001");

    expect(screen.getByText(DEPRECIATION_INPUT_MESSAGES.landValueOverPrice)).toBeInTheDocument();
    expect(screen.getByLabelText(DEPRECIATION_INPUT_MESSAGES.landValue)).toHaveAttribute("aria-invalid", "true");
    expect(saveButton()).toBeDisabled();
  });

  it("blocks land value when there's no purchase price", async () => {
    const user = userEvent.setup();
    renderCard({ ...rental, purchase_price: null });

    await user.type(screen.getByLabelText(DEPRECIATION_INPUT_MESSAGES.landValue), "25000");

    expect(screen.getByText(DEPRECIATION_INPUT_MESSAGES.landValueNeedsPrice)).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });

  it("blocks a date placed in service in the future", async () => {
    const user = userEvent.setup();
    renderCard();

    await user.type(screen.getByLabelText(DEPRECIATION_INPUT_MESSAGES.placedInService), "2999-01-01");

    expect(screen.getByText(DEPRECIATION_INPUT_MESSAGES.placedInServiceInFuture)).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });

  it("hides the inputs for a home that isn't a rental and doesn't send them", async () => {
    const user = userEvent.setup();
    renderCard();

    await user.type(screen.getByLabelText(DEPRECIATION_INPUT_MESSAGES.landValue), "999999");
    await user.click(screen.getByText("Primary Residence"));

    expect(screen.queryByLabelText(DEPRECIATION_INPUT_MESSAGES.landValue)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(DEPRECIATION_INPUT_MESSAGES.placedInService)).not.toBeInTheDocument();
    await user.click(saveButton());

    await waitFor(() => expect(updateProperty).toHaveBeenCalled());
    expect(updateProperty.mock.calls[0][0].data).not.toHaveProperty("land_value");
  });
});
