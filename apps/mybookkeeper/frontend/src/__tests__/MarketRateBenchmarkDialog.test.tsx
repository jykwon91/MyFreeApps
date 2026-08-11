/**
 * Unit tests for the market-rate dialog.
 *
 * Two things matter here. The unit asked for must follow the service type —
 * internet is quoted per month, everything else per kWh — because a rate
 * recorded in the wrong unit produces a comparison that is confidently wrong
 * rather than merely absent. And switching service must reload the fields from
 * *that* type's saved benchmark rather than carrying the previous one across.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { showError } from "@/shared/lib/toast-store";
import { store } from "@/shared/store";
import MarketRateBenchmarkDialog from "@/app/features/utility/MarketRateBenchmarkDialog";
import type { MarketRateBenchmark } from "@/shared/types/utility/market-rate-benchmark";

// ── Mocks ───────────────────────────────────────────────────────────────────

const mockUpsert = vi.fn();
const mockDelete = vi.fn();
let mockBenchmarks: MarketRateBenchmark[] = [];

vi.mock("@/shared/store/marketRateBenchmarksApi", () => ({
  useGetMarketRateBenchmarksQuery: vi.fn(() => ({
    data: mockBenchmarks,
    isLoading: false,
  })),
  useUpsertMarketRateBenchmarkMutation: vi.fn(() => [
    mockUpsert,
    { isLoading: false },
  ]),
  useDeleteMarketRateBenchmarkMutation: vi.fn(() => [
    mockDelete,
    { isLoading: false },
  ]),
}));

vi.mock("@/shared/lib/toast-store", () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

// ── Test data ────────────────────────────────────────────────────────────────

function makeBenchmark(overrides: Partial<MarketRateBenchmark> = {}): MarketRateBenchmark {
  return {
    id: "bench-1",
    service_type: "electricity",
    rate_cents_per_kwh: "11.1000",
    monthly_cents: null,
    source: "Power to Choose, 77021",
    observed_on: "2026-08-01",
    notes: null,
    is_stale: false,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

const onClose = vi.fn();

function renderDialog() {
  return render(
    <Provider store={store}>
      <MarketRateBenchmarkDialog onClose={onClose} />
    </Provider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockBenchmarks = [];
  mockUpsert.mockReturnValue({ unwrap: () => Promise.resolve(makeBenchmark()) });
  mockDelete.mockReturnValue({ unwrap: () => Promise.resolve(undefined) });
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("MarketRateBenchmarkDialog — the unit follows the service type", () => {
  it("asks for ¢/kWh for a metered service", () => {
    renderDialog();

    expect(screen.getByLabelText(/Going rate \(¢\/kWh/)).toBeInTheDocument();
  });

  it("asks for $/month once internet is selected", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.selectOptions(screen.getByTestId("benchmark-service-type"), "internet");

    expect(screen.getByLabelText("Going rate ($/month)")).toBeInTheDocument();
  });

  it("sends a metered rate as rate_cents_per_kwh only", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByTestId("benchmark-figure"), "10.8");
    await user.type(screen.getByTestId("benchmark-source"), "Power to Choose");
    await user.click(screen.getByTestId("utility-plan-save-button"));

    expect(mockUpsert).toHaveBeenCalledTimes(1);
    const arg = mockUpsert.mock.calls[0][0];
    expect(arg.serviceType).toBe("electricity");
    expect(arg.data.rate_cents_per_kwh).toBe("10.8");
    expect(arg.data.monthly_cents).toBeUndefined();
  });

  it("converts a flat monthly to integer cents", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.selectOptions(screen.getByTestId("benchmark-service-type"), "internet");
    await user.type(screen.getByTestId("benchmark-figure"), "60.00");
    await user.click(screen.getByTestId("utility-plan-save-button"));

    const arg = mockUpsert.mock.calls[0][0];
    expect(arg.data.monthly_cents).toBe(6000);
    expect(arg.data.rate_cents_per_kwh).toBeUndefined();
  });
});

describe("MarketRateBenchmarkDialog — existing values", () => {
  it("prefills from the saved benchmark for the selected service", () => {
    mockBenchmarks = [makeBenchmark()];

    renderDialog();

    expect(screen.getByTestId("benchmark-figure")).toHaveValue(11.1);
    expect(screen.getByTestId("benchmark-source")).toHaveValue(
      "Power to Choose, 77021",
    );
    expect(screen.getByTestId("utility-plan-save-button")).toHaveTextContent(
      "Update rate",
    );
  });

  it("does not carry one service's figure across to another", async () => {
    mockBenchmarks = [makeBenchmark()];
    const user = userEvent.setup();
    renderDialog();

    await user.selectOptions(screen.getByTestId("benchmark-service-type"), "internet");

    expect(screen.getByTestId("benchmark-figure")).toHaveValue(null);
    expect(screen.getByTestId("utility-plan-save-button")).toHaveTextContent(
      "Save rate",
    );
  });
});

describe("MarketRateBenchmarkDialog — submit guard", () => {
  it("keeps save disabled until a positive figure is entered", async () => {
    const user = userEvent.setup();
    renderDialog();

    expect(screen.getByTestId("utility-plan-save-button")).toBeDisabled();

    await user.type(screen.getByTestId("benchmark-figure"), "10.8");

    expect(screen.getByTestId("utility-plan-save-button")).toBeEnabled();
  });

  it("closes once the save resolves", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByTestId("benchmark-figure"), "10.8");
    await user.click(screen.getByTestId("utility-plan-save-button"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("stays open when the save fails", async () => {
    mockUpsert.mockReturnValue({
      unwrap: () => Promise.reject(new Error("boom")),
    });
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByTestId("benchmark-figure"), "10.8");
    await user.click(screen.getByTestId("utility-plan-save-button"));

    expect(onClose).not.toHaveBeenCalled();
  });

  it("surfaces the backend's reason rather than a generic retry", async () => {
    // "Try again" on a payload the server will reject identically every time
    // sends the operator round a loop they cannot exit.
    mockUpsert.mockReturnValue({
      unwrap: () =>
        Promise.reject({
          status: 422,
          data: { detail: "electricity is metered — provide rate_cents_per_kwh." },
        }),
    });
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByTestId("benchmark-figure"), "10.8");
    await user.click(screen.getByTestId("utility-plan-save-button"));

    expect(showError).toHaveBeenCalledWith(
      "electricity is metered — provide rate_cents_per_kwh.",
    );
  });
});

describe("MarketRateBenchmarkDialog — removing a rate", () => {
  it("offers no removal when nothing is recorded for this service", () => {
    renderDialog();

    expect(screen.queryByTestId("benchmark-remove-button")).not.toBeInTheDocument();
  });

  it("removes the recorded rate and closes", async () => {
    mockBenchmarks = [makeBenchmark()];
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByTestId("benchmark-remove-button"));

    expect(mockDelete).toHaveBeenCalledWith("electricity");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("stays open when the removal fails", async () => {
    mockBenchmarks = [makeBenchmark()];
    mockDelete.mockReturnValue({ unwrap: () => Promise.reject(new Error("boom")) });
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByTestId("benchmark-remove-button"));

    expect(onClose).not.toHaveBeenCalled();
  });
});
