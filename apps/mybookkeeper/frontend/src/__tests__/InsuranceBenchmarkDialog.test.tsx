/**
 * Unit tests for the market-premium dialog.
 *
 * The thing worth protecting is that both figures are required. The comparison
 * runs on premium *per $1,000 of coverage*, so a premium saved without the
 * dwelling amount it was priced against cannot be normalised — it would sit in
 * the database matching nothing while the operator believed their policies were
 * being checked. Refusing it is the whole point of the guard.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { showError } from "@/shared/lib/toast-store";
import { store } from "@/shared/store";
import InsuranceBenchmarkDialog from "@/app/features/insurance/InsuranceBenchmarkDialog";
import type { InsuranceBenchmark } from "@/shared/types/insurance/insurance-benchmark";

// ── Mocks ───────────────────────────────────────────────────────────────────

const mockUpsert = vi.fn();
const mockDelete = vi.fn();
let mockBenchmark: InsuranceBenchmark | null = null;
let mockLoading = false;

vi.mock("@/shared/store/insuranceBenchmarksApi", () => ({
  useGetInsuranceBenchmarkQuery: vi.fn(() => ({
    data: mockBenchmark,
    isLoading: mockLoading,
  })),
  useUpsertInsuranceBenchmarkMutation: vi.fn(() => [mockUpsert, { isLoading: false }]),
  useDeleteInsuranceBenchmarkMutation: vi.fn(() => [mockDelete, { isLoading: false }]),
}));

vi.mock("@/shared/lib/toast-store", () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

// ── Test data ────────────────────────────────────────────────────────────────

function makeBenchmark(overrides: Partial<InsuranceBenchmark> = {}): InsuranceBenchmark {
  return {
    id: "bench-1",
    annual_premium_cents: 120_000,
    coverage_amount_cents: 40_000_000,
    region_label: "Harris County, TX",
    source: "TDI HelpInsure, HO-3, $2,500 deductible",
    observed_on: "2026-08-01",
    notes: null,
    rate_cents_per_1000_coverage: "300.00",
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
      <InsuranceBenchmarkDialog onClose={onClose} />
    </Provider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockBenchmark = null;
  mockLoading = false;
  mockUpsert.mockReturnValue({ unwrap: () => Promise.resolve(makeBenchmark()) });
  mockDelete.mockReturnValue({ unwrap: () => Promise.resolve(undefined) });
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("InsuranceBenchmarkDialog — recording a premium", () => {
  it("sends both figures as integer cents", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByTestId("insurance-benchmark-premium"), "1344.50");
    await user.type(screen.getByTestId("insurance-benchmark-coverage"), "400000");
    await user.click(screen.getByTestId("insurance-benchmark-save-button"));

    expect(mockUpsert).toHaveBeenCalledTimes(1);
    const arg = mockUpsert.mock.calls[0][0];
    expect(arg.annual_premium_cents).toBe(134_450);
    expect(arg.coverage_amount_cents).toBe(40_000_000);
  });

  it("sends blank optional fields as null rather than empty strings", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByTestId("insurance-benchmark-premium"), "1344");
    await user.type(screen.getByTestId("insurance-benchmark-coverage"), "400000");
    await user.click(screen.getByTestId("insurance-benchmark-save-button"));

    const arg = mockUpsert.mock.calls[0][0];
    expect(arg.region_label).toBeNull();
    expect(arg.source).toBeNull();
    expect(arg.notes).toBeNull();
  });

  it("trims the free-text fields it does send", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByTestId("insurance-benchmark-premium"), "1344");
    await user.type(screen.getByTestId("insurance-benchmark-coverage"), "400000");
    await user.type(screen.getByTestId("insurance-benchmark-region"), "  Harris County  ");
    await user.click(screen.getByTestId("insurance-benchmark-save-button"));

    expect(mockUpsert.mock.calls[0][0].region_label).toBe("Harris County");
  });

  it("defaults the observation date to today so it can age into staleness", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByTestId("insurance-benchmark-premium"), "1344");
    await user.type(screen.getByTestId("insurance-benchmark-coverage"), "400000");
    await user.click(screen.getByTestId("insurance-benchmark-save-button"));

    const now = new Date();
    const today = `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, "0")}-${`${now.getDate()}`.padStart(2, "0")}`;
    expect(mockUpsert.mock.calls[0][0].observed_on).toBe(today);
  });

  it("closes once the save resolves", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByTestId("insurance-benchmark-premium"), "1344");
    await user.type(screen.getByTestId("insurance-benchmark-coverage"), "400000");
    await user.click(screen.getByTestId("insurance-benchmark-save-button"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("stays open when the save fails", async () => {
    mockUpsert.mockReturnValue({ unwrap: () => Promise.reject(new Error("boom")) });
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByTestId("insurance-benchmark-premium"), "1344");
    await user.type(screen.getByTestId("insurance-benchmark-coverage"), "400000");
    await user.click(screen.getByTestId("insurance-benchmark-save-button"));

    expect(onClose).not.toHaveBeenCalled();
  });

  it("surfaces the backend's reason rather than a generic retry", async () => {
    // The server names the rule the payload broke — a future observation date,
    // a cents/dollars mix-up. "Try again" would send the operator to retype a
    // value that will be rejected identically.
    mockUpsert.mockReturnValue({
      unwrap: () =>
        Promise.reject({
          status: 422,
          data: { detail: "observed_on cannot be in the future." },
        }),
    });
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByTestId("insurance-benchmark-premium"), "1344");
    await user.type(screen.getByTestId("insurance-benchmark-coverage"), "400000");
    await user.click(screen.getByTestId("insurance-benchmark-save-button"));

    expect(showError).toHaveBeenCalledWith("observed_on cannot be in the future.");
  });
});

describe("InsuranceBenchmarkDialog — both figures are required", () => {
  it("keeps save disabled until both are entered", async () => {
    const user = userEvent.setup();
    renderDialog();

    expect(screen.getByTestId("insurance-benchmark-save-button")).toBeDisabled();

    await user.type(screen.getByTestId("insurance-benchmark-premium"), "1344");
    // A premium alone can never be normalised, so it is still not submittable.
    expect(screen.getByTestId("insurance-benchmark-save-button")).toBeDisabled();

    await user.type(screen.getByTestId("insurance-benchmark-coverage"), "400000");
    expect(screen.getByTestId("insurance-benchmark-save-button")).toBeEnabled();
  });

  it("does not accept coverage on its own either", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByTestId("insurance-benchmark-coverage"), "400000");

    expect(screen.getByTestId("insurance-benchmark-save-button")).toBeDisabled();
  });

  it("rejects a zero premium as unusable, not as a free policy", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByTestId("insurance-benchmark-premium"), "0");
    await user.type(screen.getByTestId("insurance-benchmark-coverage"), "400000");

    expect(screen.getByTestId("insurance-benchmark-save-button")).toBeDisabled();
  });
});

describe("InsuranceBenchmarkDialog — an existing premium", () => {
  it("prefills both figures as dollars", () => {
    mockBenchmark = makeBenchmark();

    renderDialog();

    expect(screen.getByTestId("insurance-benchmark-premium")).toHaveValue(1200);
    expect(screen.getByTestId("insurance-benchmark-coverage")).toHaveValue(400000);
    expect(screen.getByTestId("insurance-benchmark-source")).toHaveValue(
      "TDI HelpInsure, HO-3, $2,500 deductible",
    );
    expect(screen.getByTestId("insurance-benchmark-save-button")).toHaveTextContent(
      "Update premium",
    );
  });

  it("shows a skeleton rather than an empty form while loading", () => {
    mockLoading = true;

    renderDialog();

    expect(
      screen.getByTestId("insurance-benchmark-dialog-loading"),
    ).toHaveAttribute("aria-busy", "true");
    expect(
      screen.queryByTestId("insurance-benchmark-premium"),
    ).not.toBeInTheDocument();
  });
});

describe("InsuranceBenchmarkDialog — removing a premium", () => {
  it("offers no removal when nothing is recorded", () => {
    renderDialog();

    expect(
      screen.queryByTestId("insurance-benchmark-remove-button"),
    ).not.toBeInTheDocument();
  });

  it("removes the recorded premium and closes", async () => {
    // Without this a premium taken from a quote that turned out not to apply
    // could only be overwritten, never retracted — and every policy would keep
    // being measured against it.
    mockBenchmark = makeBenchmark();
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByTestId("insurance-benchmark-remove-button"));

    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("stays open when the removal fails", async () => {
    mockBenchmark = makeBenchmark();
    mockDelete.mockReturnValue({ unwrap: () => Promise.reject(new Error("boom")) });
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByTestId("insurance-benchmark-remove-button"));

    expect(onClose).not.toHaveBeenCalled();
  });
});
