/**
 * Unit tests for ContractDatesEditor.
 *
 * Post-PR-1b scope: ``contract_end`` is no longer editable on the applicant
 * (it's derived from the latest signed lease). The editor only handles
 * ``contract_start`` now.
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
import { render, screen, fireEvent, act } from "@testing-library/react";
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
    value: string | null;
  }> = {},
) {
  const props = {
    applicantId: "app-123",
    field: "contract_start" as const,
    value: "2026-06-01",
    stage: "lead" as ApplicantStage,
    label: "Start",
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
    const input = screen.getByTestId("contract-date-input-contract_start");
    expect(input).toBeInTheDocument();
    expect(input).not.toBeDisabled();
    expect((input as HTMLInputElement).value).toBe("2026-06-01");
  });

  it("renders read-only span + lock icon when stage is lease_signed", () => {
    renderEditor({ stage: "lease_signed" });
    expect(screen.queryByTestId("contract-date-input-contract_start")).toBeNull();
    expect(
      screen.getByTestId("contract-dates-locked-contract_start"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("contract-dates-lock-icon-contract_start"),
    ).toBeInTheDocument();
  });

  it("lock icon title mentions lease and update", () => {
    renderEditor({ stage: "lease_signed" });
    const lockEl = screen.getByTestId("contract-dates-lock-icon-contract_start");
    expect(lockEl.getAttribute("title")).toMatch(/lease/i);
  });

  it("calls the mutation after blur + debounce when value changes", async () => {
    mockUpdateDates.mockReturnValue({ unwrap: () => Promise.resolve({}) });
    renderEditor({ stage: "approved", value: "2026-06-01" });
    const input = screen.getByTestId("contract-date-input-contract_start");

    fireEvent.change(input, { target: { value: "2026-07-01" } });
    fireEvent.blur(input);

    expect(mockUpdateDates).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(700);
    });

    expect(mockUpdateDates).toHaveBeenCalledOnce();
    expect(mockUpdateDates).toHaveBeenCalledWith({
      applicantId: "app-123",
      data: { contract_start: "2026-07-01" },
    });
  });

  it("does NOT call the mutation when value is unchanged on blur", async () => {
    renderEditor({ stage: "approved", value: "2026-06-01" });
    const input = screen.getByTestId("contract-date-input-contract_start");

    fireEvent.blur(input);

    await act(async () => {
      vi.advanceTimersByTime(700);
    });

    expect(mockUpdateDates).not.toHaveBeenCalled();
  });

  it("shows success toast after successful save", async () => {
    mockUpdateDates.mockReturnValue({ unwrap: () => Promise.resolve({}) });
    renderEditor({ stage: "approved", value: "2026-06-01" });
    const input = screen.getByTestId("contract-date-input-contract_start");

    fireEvent.change(input, { target: { value: "2026-07-01" } });
    fireEvent.blur(input);

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(mockShowSuccess).toHaveBeenCalledOnce();
  });

  it("shows error toast and reverts value on mutation failure", async () => {
    mockUpdateDates.mockReturnValue({
      unwrap: () =>
        Promise.reject({ data: { detail: { message: "Something went wrong" } } }),
    });
    renderEditor({ stage: "approved", value: "2026-06-01" });
    const input = screen.getByTestId(
      "contract-date-input-contract_start",
    ) as HTMLInputElement;

    fireEvent.change(input, { target: { value: "2026-07-01" } });
    fireEvent.blur(input);

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(mockShowError).toHaveBeenCalledOnce();
    expect(input.value).toBe("2026-06-01");
  });
});
