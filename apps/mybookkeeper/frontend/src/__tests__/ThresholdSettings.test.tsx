import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ThresholdSettings from "@/admin/features/costs/ThresholdSettings";

const { update, showSuccess, showError } = vi.hoisted(() => ({
  update: vi.fn(),
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

vi.mock("@/shared/store/costsApi", () => ({
  useGetCostThresholdsQuery: () => ({
    data: {
      daily_budget: 10,
      monthly_budget: 200,
      per_user_daily_alert: 5,
      input_rate_per_million: 3,
      output_rate_per_million: 15,
    },
  }),
  useUpdateCostThresholdsMutation: () => [update, { isLoading: false }],
}));

vi.mock("@/shared/hooks/useToast", () => ({ useToast: () => ({ showSuccess, showError }) }));

const onSaved = vi.fn();

async function save() {
  await userEvent.click(screen.getByRole("button", { name: "Save Changes" }));
}

describe("ThresholdSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    update.mockReturnValue({ unwrap: () => Promise.resolve({}) });
  });

  it.each([
    ["", "Enter a number from 0 to 500."],
    ["-1", "Enter a number from 0 to 500."],
    ["501", "Enter a number from 0 to 500."],
  ])("refuses a daily budget of %j, saves nothing and shows no success", async (value, message) => {
    render(<ThresholdSettings onSaved={onSaved} />);
    const field = screen.getByLabelText("Daily Budget");
    await userEvent.clear(field);
    if (value) await userEvent.type(field, value);

    await save();

    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(update).not.toHaveBeenCalled();
    expect(showSuccess).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("clears the error when the field is edited and then saves every value", async () => {
    render(<ThresholdSettings onSaved={onSaved} />);
    const field = screen.getByLabelText("Daily Budget");
    await userEvent.clear(field);
    await save();
    expect(screen.getByRole("alert")).toBeInTheDocument();

    await userEvent.type(field, "25");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await save();

    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith("Thresholds updated"));
    expect(update).toHaveBeenCalledWith({
      daily_budget: 25,
      monthly_budget: 200,
      per_user_daily_alert: 5,
      input_rate_per_million: 3,
      output_rate_per_million: 15,
    });
    expect(onSaved).toHaveBeenCalled();
  });

  it("shows the server's reason and no success when the save fails", async () => {
    update.mockReturnValue({ unwrap: () => Promise.reject({ status: 422, data: { detail: "Budget too high." } }) });
    render(<ThresholdSettings onSaved={onSaved} />);
    await userEvent.type(screen.getByLabelText("Daily Budget"), "0");

    await save();

    await waitFor(() => expect(showError).toHaveBeenCalledWith("Budget too high."));
    expect(showSuccess).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });
});
