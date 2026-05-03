import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { store } from "@/shared/store";
import ApplicantStatusControl from "@/app/features/applicants/ApplicantStatusControl";
import { APPLICANT_STAGE_LABELS } from "@/shared/lib/applicant-labels";
import { getAllowedTransitions } from "@/shared/lib/applicant-stage-transitions";
import type { ApplicantStage } from "@/shared/types/applicant/applicant-stage";

// --- mocks ---

vi.mock("@/shared/hooks/useOrgRole", () => ({
  useCanWrite: vi.fn(() => true),
}));

const mockTransitionStage = vi.fn();
vi.mock("@/shared/store/applicantsApi", () => ({
  useTransitionApplicantStageMutation: vi.fn(() => [mockTransitionStage, { isLoading: false }]),
}));

vi.mock("@/shared/hooks/useToast", () => ({
  useToast: vi.fn(() => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
  })),
}));

import { useCanWrite } from "@/shared/hooks/useOrgRole";

function renderControl(stage: ApplicantStage = "lead") {
  return render(
    <Provider store={store}>
      <ApplicantStatusControl applicantId="app-123" currentStage={stage} />
    </Provider>,
  );
}

describe("ApplicantStatusControl", () => {
  beforeEach(() => {
    vi.mocked(useCanWrite).mockReturnValue(true);
    mockTransitionStage.mockReset();
  });

  it("renders the current stage label", () => {
    renderControl("lead");
    expect(screen.getByTestId("applicant-stage-badge-lead")).toBeInTheDocument();
    expect(screen.getByText(APPLICANT_STAGE_LABELS.lead)).toBeInTheDocument();
  });

  it("opens the popover on trigger click", () => {
    renderControl("lead");
    expect(screen.queryByTestId("applicant-status-popover")).toBeNull();
    fireEvent.click(screen.getByTestId("applicant-status-control-trigger"));
    expect(screen.getByTestId("applicant-status-popover")).toBeInTheDocument();
  });

  it("only shows allowed transitions for the current stage", () => {
    renderControl("lead");
    fireEvent.click(screen.getByTestId("applicant-status-control-trigger"));
    const select = screen.getByTestId("applicant-status-stage-select") as HTMLSelectElement;
    const options = Array.from(select.options)
      .filter((o) => o.value !== "")
      .map((o) => o.value);
    expect(options.sort()).toEqual([...getAllowedTransitions("lead")].sort());
  });

  it("closes the popover on Cancel click", () => {
    renderControl("lead");
    fireEvent.click(screen.getByTestId("applicant-status-control-trigger"));
    expect(screen.getByTestId("applicant-status-popover")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("applicant-status-cancel"));
    expect(screen.queryByTestId("applicant-status-popover")).toBeNull();
  });

  it("confirm is disabled until a stage is selected", () => {
    renderControl("lead");
    fireEvent.click(screen.getByTestId("applicant-status-control-trigger"));
    const confirm = screen.getByTestId("applicant-status-confirm") as HTMLButtonElement;
    expect(confirm).toBeDisabled();
  });

  it("calls the mutation with the selected stage and note on confirm", async () => {
    mockTransitionStage.mockResolvedValueOnce({ data: { stage: "approved" }, unwrap: () => Promise.resolve({ stage: "approved" }) });
    renderControl("lead");
    fireEvent.click(screen.getByTestId("applicant-status-control-trigger"));

    const select = screen.getByTestId("applicant-status-stage-select");
    fireEvent.change(select, { target: { value: "approved" } });

    const noteArea = screen.getByTestId("applicant-status-note");
    fireEvent.change(noteArea, { target: { value: "Test note" } });

    fireEvent.click(screen.getByTestId("applicant-status-confirm"));

    await waitFor(() => {
      expect(mockTransitionStage).toHaveBeenCalledWith({
        applicantId: "app-123",
        data: { new_stage: "approved", note: "Test note" },
      });
    });
  });

  it("shows no transitions and no select for terminal stage (lease_signed)", () => {
    renderControl("lease_signed");
    fireEvent.click(screen.getByTestId("applicant-status-control-trigger"));
    expect(screen.queryByTestId("applicant-status-stage-select")).toBeNull();
    expect(screen.getByText(/No further transitions/i)).toBeInTheDocument();
  });

  it("renders a plain non-interactive badge for read-only viewers", () => {
    vi.mocked(useCanWrite).mockReturnValue(false);
    renderControl("approved");
    expect(screen.queryByTestId("applicant-status-control-trigger")).toBeNull();
    expect(screen.getByTestId("applicant-stage-badge-approved")).toBeInTheDocument();
  });

  it("trims empty note to null before calling the mutation", async () => {
    mockTransitionStage.mockReturnValueOnce({
      unwrap: () => Promise.resolve({ stage: "approved" }),
    });
    renderControl("lead");
    fireEvent.click(screen.getByTestId("applicant-status-control-trigger"));
    fireEvent.change(screen.getByTestId("applicant-status-stage-select"), {
      target: { value: "approved" },
    });
    // Do NOT type in note field — leave blank
    fireEvent.click(screen.getByTestId("applicant-status-confirm"));

    await waitFor(() => {
      expect(mockTransitionStage).toHaveBeenCalledWith({
        applicantId: "app-123",
        data: { new_stage: "approved", note: null },
      });
    });
  });
});
