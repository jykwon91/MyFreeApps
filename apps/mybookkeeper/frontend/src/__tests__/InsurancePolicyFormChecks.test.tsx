/**
 * The dialogs refuse what the server refuses, and say which field, before sending.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AddInsurancePolicyDialog from "@/app/features/insurance/AddInsurancePolicyDialog";
import EditInsurancePolicyDialog from "@/app/features/insurance/EditInsurancePolicyDialog";
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

async function fillAdd(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(screen.getByTestId("insurance-policy-property-select"), "property-1");
  await user.type(screen.getByLabelText(/Policy name/), "Landlord policy");
}

describe("add policy checks", () => {
  it("shows nothing before a save is tried", async () => {
    const user = userEvent.setup();
    render(<AddInsurancePolicyDialog onClose={vi.fn()} />);
    await user.type(screen.getByTestId("insurance-premium-input"), "0");
    expect(screen.queryByTestId("insurance-premiumDollars-problem")).toBeNull();
  });

  it("refuses a premium of zero, ties the message to the field, and sends nothing", async () => {
    const user = userEvent.setup();
    render(<AddInsurancePolicyDialog onClose={vi.fn()} />);
    await fillAdd(user);
    await user.type(screen.getByTestId("insurance-premium-input"), "0");
    await user.selectOptions(screen.getByTestId("insurance-premium-frequency-select"), "monthly");
    await user.click(screen.getByTestId("insurance-policy-save-button"));
    expect(await screen.findByTestId("insurance-premiumDollars-problem")).toHaveTextContent("above 0");
    const input = screen.getByTestId("insurance-premium-input");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", "insurance-premiumDollars-problem");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("refuses wind and hail of zero and of three decimals", async () => {
    const user = userEvent.setup();
    render(<AddInsurancePolicyDialog onClose={vi.fn()} />);
    await fillAdd(user);
    await user.type(screen.getByTestId("insurance-wind-hail-input"), "0");
    await user.click(screen.getByTestId("insurance-policy-save-button"));
    expect(await screen.findByTestId("insurance-windHailPct-problem")).toHaveTextContent("above 0");
    await user.clear(screen.getByTestId("insurance-wind-hail-input"));
    await user.type(screen.getByTestId("insurance-wind-hail-input"), "2.555");
    expect(await screen.findByTestId("insurance-windHailPct-problem")).toHaveTextContent("two decimal places");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("still asks for a property", async () => {
    const user = userEvent.setup();
    render(<AddInsurancePolicyDialog onClose={vi.fn()} />);
    await user.type(screen.getByLabelText(/Policy name/), "Landlord policy");
    await user.click(screen.getByTestId("insurance-policy-save-button"));
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("names a missing policy name on the field", async () => {
    const user = userEvent.setup();
    render(<AddInsurancePolicyDialog onClose={vi.fn()} />);
    await user.selectOptions(screen.getByTestId("insurance-policy-property-select"), "property-1");
    await user.click(screen.getByTestId("insurance-policy-save-button"));
    expect(await screen.findByTestId("insurance-policyName-problem")).toBeVisible();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("saves a valid form", async () => {
    const user = userEvent.setup();
    render(<AddInsurancePolicyDialog onClose={vi.fn()} />);
    await fillAdd(user);
    await user.type(screen.getByTestId("insurance-wind-hail-input"), "2.5");
    await user.click(screen.getByTestId("insurance-policy-save-button"));
    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
  });
});

describe("edit policy checks", () => {
  it("refuses a premium that rounds to zero cents and sends nothing", async () => {
    const user = userEvent.setup();
    render(<EditInsurancePolicyDialog policy={POLICY} onClose={vi.fn()} />);
    await user.type(screen.getByTestId("insurance-premium-input"), "0.001");
    await user.selectOptions(screen.getByTestId("insurance-premium-frequency-select"), "annual");
    await user.click(screen.getByTestId("insurance-policy-update-button"));
    expect(await screen.findByTestId("insurance-premiumDollars-problem")).toBeVisible();
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
