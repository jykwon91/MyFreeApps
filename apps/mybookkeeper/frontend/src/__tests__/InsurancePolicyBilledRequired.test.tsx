/**
 * A premium with no "Billed" period must stop the form, not be dropped silently on save.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AddInsurancePolicyDialog from "@/app/features/insurance/AddInsurancePolicyDialog";
import EditInsurancePolicyDialog from "@/app/features/insurance/EditInsurancePolicyDialog";
import { PREMIUM_BILLED_REQUIRED_MESSAGE } from "@mybookkeeper/api-client/constants/insurancePolicyForm";
import type { InsurancePolicyDetail } from "@mybookkeeper/api-client/types/insurance/insurance-policy-detail";

const mockCreate = vi.fn();
const mockUpdate = vi.fn();

vi.mock("@mybookkeeper/api-client/store/insurancePoliciesApi", () => ({
  useCreateInsurancePolicyMutation: vi.fn(() => [mockCreate, { isLoading: false }]),
  useUpdateInsurancePolicyMutation: vi.fn(() => [mockUpdate, { isLoading: false }]),
  useExtractInsurancePolicyMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useExtractInsurancePolicyFromUploadMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
}));
vi.mock("@mybookkeeper/api-client/store/propertiesApi", () => ({
  useGetPropertiesQuery: vi.fn(() => ({ data: [{ id: "property-1", name: "6734 Peerless St" }] })),
}));
vi.mock("@mybookkeeper/api-client/store/documentsApi", () => ({
  useGetDocumentsQuery: vi.fn(() => ({ data: [] })),
}));
vi.mock("@platform/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@platform/ui")>()),
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

const POLICY = {
  id: "p1",
  policy_name: "Landlord policy",
  carrier: null,
  policy_number: null,
  effective_date: null,
  expiration_date: null,
  coverage_amount_cents: null,
  premium_cents: null,
  premium_frequency: null,
  fees_and_taxes_cents: null,
  deductible_cents: null,
  wind_hail_deductible_pct: null,
  notes: null,
} as unknown as InsurancePolicyDetail;

beforeEach(() => {
  vi.clearAllMocks();
  mockCreate.mockReturnValue({ unwrap: () => Promise.resolve({}) });
  mockUpdate.mockReturnValue({ unwrap: () => Promise.resolve({}) });
});

describe("premium without a billing period", () => {
  it("add: shows the error on Billed and sends nothing", async () => {
    const user = userEvent.setup();
    render(<AddInsurancePolicyDialog onClose={vi.fn()} />);
    await user.selectOptions(screen.getByTestId("insurance-policy-property-select"), "property-1");
    await user.type(screen.getByLabelText(/Policy name/), "Landlord policy");
    await user.type(screen.getByTestId("insurance-premium-input"), "1200");
    await user.click(screen.getByTestId("insurance-policy-save-button"));
    expect(await screen.findByTestId("insurance-premium-billed-error")).toHaveTextContent(PREMIUM_BILLED_REQUIRED_MESSAGE);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("add: saves once a period is chosen", async () => {
    const user = userEvent.setup();
    render(<AddInsurancePolicyDialog onClose={vi.fn()} />);
    await user.selectOptions(screen.getByTestId("insurance-policy-property-select"), "property-1");
    await user.type(screen.getByLabelText(/Policy name/), "Landlord policy");
    await user.type(screen.getByTestId("insurance-premium-input"), "1200");
    await user.click(screen.getByTestId("insurance-policy-save-button"));
    await user.selectOptions(screen.getByTestId("insurance-premium-frequency-select"), "monthly");
    expect(screen.queryByTestId("insurance-premium-billed-error")).toBeNull();
    await user.click(screen.getByTestId("insurance-policy-save-button"));
    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ premium_cents: 120000, premium_frequency: "monthly" })));
  });

  it("edit: shows the error on Billed and sends nothing", async () => {
    const user = userEvent.setup();
    render(<EditInsurancePolicyDialog policy={POLICY} onClose={vi.fn()} />);
    await user.type(screen.getByTestId("insurance-premium-input"), "1200");
    await user.click(screen.getByTestId("insurance-policy-update-button"));
    expect(await screen.findByTestId("insurance-premium-billed-error")).toHaveTextContent(PREMIUM_BILLED_REQUIRED_MESSAGE);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("edit: a policy with no premium saves without a period", async () => {
    const user = userEvent.setup();
    render(<EditInsurancePolicyDialog policy={POLICY} onClose={vi.fn()} />);
    await user.click(screen.getByTestId("insurance-policy-update-button"));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalled());
  });
});
