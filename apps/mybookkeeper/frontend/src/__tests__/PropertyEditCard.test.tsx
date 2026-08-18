import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { store } from "@/shared/store";
import PropertyEditCard from "@/app/features/properties/PropertyEditCard";
import type { Property } from "@/shared/types/property/property";

const rental: Property = {
  id: "prop-1",
  name: "6734 Peerless St, Houston, TX 77021",
  address: "6734 Peerless St, Houston, TX 77021",
  classification: "investment",
  type: "short_term",
  is_active: true,
  activity_periods: [],
  created_at: "2026-01-01T00:00:00Z",
};

const updateProperty = vi.fn();
const showError = vi.fn();
const showSuccess = vi.fn();

vi.mock("@/shared/store/propertiesApi", () => ({
  useUpdatePropertyMutation: vi.fn(() => [updateProperty, { isLoading: false }]),
}));

vi.mock("@/shared/hooks/useToast", () => ({
  useToast: vi.fn(() => ({ showError, showSuccess })),
}));

function renderCard(onDone = vi.fn()) {
  return render(
    <Provider store={store}>
      <PropertyEditCard property={rental} onDone={onDone} />
    </Provider>,
  );
}

describe("PropertyEditCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateProperty.mockReturnValue({ unwrap: () => Promise.resolve(rental) });
  });

  it("drops the rental type when the property becomes a primary residence", async () => {
    const user = userEvent.setup();
    renderCard();

    await user.click(screen.getByText("Primary Residence"));
    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(updateProperty).toHaveBeenCalled());
    const sent = updateProperty.mock.calls[0][0];
    expect(sent.data.classification).toBe("primary_residence");
    expect(sent.data).not.toHaveProperty("type");
  });

  it("hides the rental type picker once the home is not a rental", async () => {
    const user = userEvent.setup();
    renderCard();

    expect(screen.getByText("Rental type")).toBeInTheDocument();
    await user.click(screen.getByText("Primary Residence"));
    expect(screen.queryByText("Rental type")).not.toBeInTheDocument();
  });

  it("keeps the rental type when the property stays an investment", async () => {
    const user = userEvent.setup();
    renderCard();

    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(updateProperty).toHaveBeenCalled());
    expect(updateProperty.mock.calls[0][0].data.type).toBe("short_term");
  });

  it("closes and confirms the save when the update succeeds", async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    renderCard(onDone);

    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(showSuccess).toHaveBeenCalledWith("Property updated");
    expect(showError).not.toHaveBeenCalled();
  });

  it("surfaces a failed save instead of leaving the card silently open", async () => {
    // The reclassify 500 rejected here and nothing was rendered, so the card
    // just sat there and the user had no idea the save had failed.
    updateProperty.mockReturnValue({
      unwrap: () => Promise.reject({ data: { detail: "Server error" } }),
    });
    const user = userEvent.setup();
    const onDone = vi.fn();
    renderCard(onDone);

    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(showError).toHaveBeenCalled());
    expect(showError.mock.calls[0][0]).toContain("Server error");
    expect(onDone).not.toHaveBeenCalled();
  });
});
