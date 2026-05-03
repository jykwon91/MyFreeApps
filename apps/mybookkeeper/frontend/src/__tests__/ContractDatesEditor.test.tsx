/**
 * Unit tests for ContractDatesEditor.
 *
 * Tests:
 * - Editable when stage !== 'lease_signed'
 * - Read-only with lock icon when stage === 'lease_signed'
 * - Blur triggers the mutation after the debounce
 * - No mutation when value unchanged on blur
 * - Error toast when the mutation rejects
 * - Success toast when the mutation resolves
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { store } from "@/shared/store";
import ContractDatesEditor from "@/app/features/applicants/ContractDatesEditor";
import type { ApplicantStage } from "@/shared/types/applicant/applicant-stage";

// --- mocks ---

const mockUpdateDates = vi.fn();
vi.mock("@/shared/store/applicantsApi", () => ({
  useUpdateApplicantContractDatesMutation: vi.fn(() => [
    mockUpdateDates,
    { isLoading: false },
  ]),
}));

const mockShowSuccess = vi.fn();
const mockShowError = vi.fn();
vi.mock("@/shared/hooks/useToast", () => ({
  useToast: vi.fn(() => ({
    showSuccess: mockShowSuccess,
    showError: mockShowError,
  })),
}));

function renderEditor(
  overrides: Partial<{
    stage: ApplicantStage;
    field: "contract_start" | "contract_end";
    value: string | null;
  }> = {},
) {
  const props = {
    applicantId: "app-123",
    field: "contract_end" as const,
    value: "2026-12-31",
    stage: "lead" as ApplicantStage,
    label: "End",
    ...overrides,
  };
  return render(
    <Provider store={store}>
      <ContractDatesEditor {...props} />
    </Provider>,
  );
}

describe("ContractDatesEditor", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockUpdateDates.mockReset();
    mockShowSuccess.mockReset();
    mockShowError.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders an editable date input when stage is not lease_signed", () => {
    renderEditor({ stage: "lead" });
    const input = screen.getByTestId("contract-date-input-contract_end");
    expect(input).toBeInTheDocument();
    expect(input).not.toBeDisabled();
    expect((input as HTMLInputElement).value).toBe("2026-12-31");
  });

  it("renders read-only span + lock icon when stage is lease_signed", () => {
    renderEditor({ stage: "lease_signed" });
    expect(screen.queryByTestId("contract-date-input-contract_end")).toBeNull();
    expect(screen.getByTestId("contract-dates-locked-contract_end")).toBeInTheDocument();
    expect(screen.getByTestId("contract-dates-lock-icon-contract_end")).toBeInTheDocument();
  });

  it("lock icon title mentions lease and update", () => {
    renderEditor({ stage: "lease_signed" });
    const lockEl = screen.getByTestId("contract-dates-lock-icon-contract_end");
    expect(lockEl.getAttribute("title")).toMatch(/lease/i);
  });

  it("calls the mutation after blur + debounce when value changes", async () => {
    mockUpdateDates.mockReturnValue({ unwrap: () => Promise.resolve({}) });
    renderEditor({ stage: "approved", value: "2026-12-31" });
    const input = screen.getByTestId("contract-date-input-contract_end");

    fireEvent.change(input, { target: { value: "2026-11-30" } });
    fireEvent.blur(input);

    // Before debounce fires — mutation not yet called.
    expect(mockUpdateDates).not.toHaveBeenCalled();

    // Advance past the 600ms debounce.
    await act(async () => {
      vi.advanceTimersByTime(700);
    });

    expect(mockUpdateDates).toHaveBeenCalledOnce();
    expect(mockUpdateDates).toHaveBeenCalledWith({
      applicantId: "app-123",
      data: { contract_end: "2026-11-30" },
    });
  });

  it("does NOT call the mutation when value is unchanged on blur", async () => {
    renderEditor({ stage: "approved", value: "2026-12-31" });
    const input = screen.getByTestId("contract-date-input-contract_end");

    fireEvent.blur(input);

    await act(async () => {
      vi.advanceTimersByTime(700);
    });

    expect(mockUpdateDates).not.toHaveBeenCalled();
  });

  it("shows success toast after successful save", async () => {
    vi.useRealTimers(); // Switch to real timers for async resolution.
    mockUpdateDates.mockReturnValue({ unwrap: () => Promise.resolve({}) });
    renderEditor({ stage: "approved", value: "2026-12-31" });
    const input = screen.getByTestId("contract-date-input-contract_end");

    fireEvent.change(input, { target: { value: "2026-11-30" } });
    fireEvent.blur(input);

    // Wait for the debounce + async mutation.
    await waitFor(() => expect(mockShowSuccess).toHaveBeenCalledOnce(), {
      timeout: 2000,
    });
  });

  it("shows error toast and reverts value on mutation failure", async () => {
    vi.useRealTimers(); // Switch to real timers for async resolution.
    mockUpdateDates.mockReturnValue({
      unwrap: () => Promise.reject({ data: { detail: { message: "Something went wrong" } } }),
    });
    renderEditor({ stage: "approved", value: "2026-12-31" });
    const input = screen.getByTestId("contract-date-input-contract_end") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "2026-11-30" } });
    fireEvent.blur(input);

    // Wait for the debounce + async mutation.
    await waitFor(() => expect(mockShowError).toHaveBeenCalledOnce(), {
      timeout: 2000,
    });

    // Value should revert to the original.
    expect(input.value).toBe("2026-12-31");
  });

  it("uses field name in the test id for contract_start", () => {
    renderEditor({ field: "contract_start", value: "2026-06-01", stage: "lead" });
    expect(screen.getByTestId("contract-date-input-contract_start")).toBeInTheDocument();
  });
});
