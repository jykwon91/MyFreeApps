import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { store } from "@/shared/store";
import PromoteFromInquiryPanel from "@/app/features/applicants/PromoteFromInquiryPanel";
import type { ApplicantPromoteRequest } from "@/shared/types/applicant/applicant-promote-request";
import type { InquiryResponse } from "@/shared/types/inquiry/inquiry-response";

interface PromoteArgs {
  inquiryId: string;
  data: ApplicantPromoteRequest;
}

const promoteUnwrap = vi.fn();
const promoteMutation = vi.fn<(args: PromoteArgs) => { unwrap: typeof promoteUnwrap }>(
  () => ({ unwrap: promoteUnwrap }),
);
const navigateMock = vi.fn();
const showErrorMock = vi.fn();
const showSuccessMock = vi.fn();

vi.mock("@/shared/store/applicantsApi", () => ({
  usePromoteFromInquiryMutation: () => [promoteMutation, { isLoading: false }],
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom",
  );
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock("@/shared/lib/toast-store", () => ({
  showError: (m: string) => showErrorMock(m),
  showSuccess: (m: string) => showSuccessMock(m),
  subscribe: () => () => {},
}));

function buildInquiry(overrides: Partial<InquiryResponse> = {}): InquiryResponse {
  return {
    id: "inq-1",
    organization_id: "org-1",
    user_id: "user-1",
    listing_id: null,
    source: "FF",
    external_inquiry_id: "I-12345",
    inquirer_name: "Alice Tester",
    inquirer_email: "alice@example.com",
    inquirer_phone: null,
    inquirer_employer: "Memorial Hermann",
    desired_start_date: "2026-06-01",
    desired_end_date: "2026-12-01",
    stage: "new",
    gut_rating: null,
    notes: null,
    received_at: "2026-04-25T10:00:00Z",
    email_message_id: null,
    linked_applicant_id: null,
    messages: [],
    events: [],
    created_at: "2026-04-25T10:00:00Z",
    updated_at: "2026-04-25T10:00:00Z",
    ...overrides,
  };
}

function renderPanel(inquiry: InquiryResponse) {
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <PromoteFromInquiryPanel inquiry={inquiry} onClose={vi.fn()} />
      </MemoryRouter>
    </Provider>,
  );
}

describe("PromoteFromInquiryPanel", () => {
  beforeEach(() => {
    promoteMutation.mockClear();
    promoteUnwrap.mockReset();
    navigateMock.mockClear();
    showErrorMock.mockClear();
    showSuccessMock.mockClear();
  });

  it("pre-fills name, employer, and contract dates from the inquiry", () => {
    renderPanel(buildInquiry());
    expect(
      (screen.getByTestId("promote-form-legal-name") as HTMLInputElement).value,
    ).toBe("Alice Tester");
    expect(
      (screen.getByTestId("promote-form-employer") as HTMLInputElement).value,
    ).toBe("Memorial Hermann");
    expect(
      (screen.getByTestId("promote-form-contract-start") as HTMLInputElement).value,
    ).toBe("2026-06-01");
    expect(
      (screen.getByTestId("promote-form-contract-end") as HTMLInputElement).value,
    ).toBe("2026-12-01");
  });

  it("shows an orange warning hint next to fields the inquiry didn't supply", () => {
    // Inquiry with NO employer or dates — those fields should show the hint.
    const sparse = buildInquiry({
      inquirer_employer: null,
      desired_start_date: null,
      desired_end_date: null,
    });
    renderPanel(sparse);
    // The dob, vehicle, smoker, referred_by, and pets fields always show the hint
    // (no inquiry source). Plus employer + 2 dates. Total ≥ 5.
    const hints = screen.getAllByTestId("promote-missing-hint");
    expect(hints.length).toBeGreaterThanOrEqual(5);
  });

  it("does not show a missing-hint next to inquiry-supplied fields", () => {
    renderPanel(buildInquiry());
    // Locate the legal name input's wrapper and verify there's no warning
    // icon as a sibling.
    const legalNameInput = screen.getByTestId("promote-form-legal-name");
    const wrapper = legalNameInput.parentElement!;
    expect(wrapper.querySelector('[data-testid="promote-missing-hint"]')).toBeNull();
  });

  it("blocks submission and shows an inline error when end date is before start", async () => {
    const user = userEvent.setup();
    renderPanel(buildInquiry());

    // Set end before start.
    const endInput = screen.getByTestId("promote-form-contract-end") as HTMLInputElement;
    await user.clear(endInput);
    await user.type(endInput, "2026-05-01");

    await user.click(screen.getByTestId("promote-form-submit"));

    expect(
      await screen.findByTestId("promote-form-contract-end-error"),
    ).toHaveTextContent(/end date can't be before start date/i);
    expect(promoteMutation).not.toHaveBeenCalled();
  });

  it("calls the promote mutation on submit and navigates to the new applicant", async () => {
    const user = userEvent.setup();
    promoteUnwrap.mockResolvedValue({
      id: "new-applicant-id",
      stage: "lead",
    });
    renderPanel(buildInquiry());

    await user.click(screen.getByTestId("promote-form-submit"));

    // Wait for the mutation to fire.
    await vi.waitFor(() => {
      expect(promoteMutation).toHaveBeenCalledTimes(1);
    });
    const args = promoteMutation.mock.calls[0][0];
    expect(args.inquiryId).toBe("inq-1");
    expect(args.data.legal_name).toBe("Alice Tester");
    expect(args.data.employer_or_hospital).toBe("Memorial Hermann");

    await vi.waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/applicants/new-applicant-id");
    });
    expect(showSuccessMock).toHaveBeenCalledWith("Promoted to applicant.");
  });

  it("on 409 already_promoted, navigates to the existing applicant", async () => {
    const user = userEvent.setup();
    promoteUnwrap.mockRejectedValue({
      status: 409,
      data: {
        detail: {
          code: "already_promoted",
          message: "already",
          applicant_id: "existing-applicant-id",
        },
      },
    });
    renderPanel(buildInquiry());

    await user.click(screen.getByTestId("promote-form-submit"));

    await vi.waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith(
        "/applicants/existing-applicant-id",
      );
    });
    expect(showErrorMock).toHaveBeenCalled();
  });

  it("on 409 not_promotable, shows an error toast without navigating", async () => {
    const user = userEvent.setup();
    promoteUnwrap.mockRejectedValue({
      status: 409,
      data: {
        detail: {
          code: "not_promotable",
          message: "declined",
          stage: "declined",
        },
      },
    });
    renderPanel(buildInquiry());

    await user.click(screen.getByTestId("promote-form-submit"));

    await vi.waitFor(() => {
      expect(showErrorMock).toHaveBeenCalled();
    });
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("converts blank fields to null in the request body", async () => {
    const user = userEvent.setup();
    promoteUnwrap.mockResolvedValue({ id: "new-id", stage: "lead" });
    // Inquiry with no employer — the form leaves the employer input empty.
    renderPanel(buildInquiry({ inquirer_employer: null }));

    await user.click(screen.getByTestId("promote-form-submit"));

    await vi.waitFor(() => {
      expect(promoteMutation).toHaveBeenCalledTimes(1);
    });
    const data = promoteMutation.mock.calls[0][0].data;
    expect(data.employer_or_hospital).toBeNull();
    expect(data.dob).toBeNull();
    expect(data.vehicle_make_model).toBeNull();
    expect(data.smoker).toBeNull();
    expect(data.pets).toBeNull();
    expect(data.referred_by).toBeNull();
  });
});
