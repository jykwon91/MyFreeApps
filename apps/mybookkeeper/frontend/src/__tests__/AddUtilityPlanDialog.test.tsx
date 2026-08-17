/**
 * Unit tests for the read-a-document path on the utility-plan add dialog.
 *
 * Verifies:
 * - Reading a document prefills the form and records what it was read from
 * - Terms the form has no field for are surfaced rather than dropped
 * - A failed reading leaves the operator able to fill the form by hand
 * - Saving without reading anything sends no source_document_id
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AddUtilityPlanDialog from "@/app/features/utility/AddUtilityPlanDialog";
import { showError } from "@/shared/lib/toast-store";
import type { UtilityPlanDraft } from "@/shared/types/utility/utility-plan-draft";

// ── Mocks ───────────────────────────────────────────────────────────────────

const mockCreate = vi.fn();
const mockExtract = vi.fn();
const mockExtractUpload = vi.fn();

vi.mock("@/shared/store/utilityPlansApi", () => ({
  useCreateUtilityPlanMutation: vi.fn(() => [mockCreate, { isLoading: false }]),
  useExtractUtilityPlanMutation: vi.fn(() => [mockExtract, { isLoading: false }]),
  useExtractUtilityPlanFromUploadMutation: vi.fn(() => [
    mockExtractUpload,
    { isLoading: false },
  ]),
}));

vi.mock("@/shared/store/propertiesApi", () => ({
  useGetPropertiesQuery: vi.fn(() => ({
    data: [{ id: "prop-1", name: "6734 Peerless St" }],
  })),
}));

vi.mock("@/shared/store/documentsApi", () => ({
  useGetDocumentsQuery: vi.fn(() => ({
    data: [{ id: "doc-1", file_name: "constellation-efl.pdf" }],
  })),
}));

vi.mock("@/shared/lib/toast-store", () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

// ── Test data ────────────────────────────────────────────────────────────────

const DRAFT: UtilityPlanDraft = {
  source_document_id: "doc-1",
  service_type: "electricity",
  provider_name: "Constellation",
  plan_name: "12 Month Usage Bill Credit",
  account_number: null,
  rate_type: "fixed",
  energy_charge_cents_per_kwh: "14.1100",
  tdu_charge_cents_per_kwh: null,
  avg_price_cents_per_kwh_at_1000: "17.1000",
  monthly_base_charge_cents: 0,
  term_months: 12,
  service_start_date: null,
  term_end_date: "2027-02-17",
  early_termination_fee_cents: 15000,
  has_bill_credit: true,
  bill_credit_amount_cents: 3500,
  bill_credit_threshold_kwh: 1000,
  min_usage_fee_cents: 0,
  min_usage_threshold_kwh: null,
  post_promo_monthly_cents: null,
  equipment_fee_monthly_cents: null,
  download_mbps: null,
  upload_mbps: null,
  data_cap_gb: null,
  notes: null,
  confidence: "high",
  warnings: [],
  unrepresented: [],
};

function renderDialog() {
  return render(<AddUtilityPlanDialog onClose={vi.fn()} />);
}

async function readTheDocument(user: ReturnType<typeof userEvent.setup>) {
  // The library picker is collapsed now that uploading is the primary path,
  // and picking is what starts the read — there is no confirm step.
  await user.click(screen.getByText(/already uploaded/));
  await user.selectOptions(
    screen.getByTestId("utility-plan-document-select"),
    "doc-1",
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCreate.mockReturnValue({ unwrap: vi.fn().mockResolvedValue({ id: "plan-1" }) });
  mockExtract.mockReturnValue({ unwrap: vi.fn().mockResolvedValue(DRAFT) });
  mockExtractUpload.mockReturnValue({ unwrap: vi.fn().mockResolvedValue(DRAFT) });
});

describe("AddUtilityPlanDialog — reading from a document", () => {
  it("prefills the form from what the document said", async () => {
    const user = userEvent.setup();
    renderDialog();

    await readTheDocument(user);

    await waitFor(() => {
      expect(screen.getByDisplayValue("Constellation")).toBeInTheDocument();
    });
    expect(mockExtract).toHaveBeenCalledWith({ document_id: "doc-1" });
    expect(screen.getByDisplayValue("14.11")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2027-02-17")).toBeInTheDocument();
  });

  it("records which document the plan was read from when it saves", async () => {
    const user = userEvent.setup();
    renderDialog();

    await readTheDocument(user);
    await waitFor(() => {
      expect(screen.getByDisplayValue("Constellation")).toBeInTheDocument();
    });
    await user.selectOptions(
      screen.getByTestId("utility-plan-property-select"),
      "prop-1",
    );
    await user.click(screen.getByTestId("utility-plan-save-button"));

    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    expect(mockCreate.mock.calls[0][0]).toMatchObject({
      property_id: "prop-1",
      provider_name: "Constellation",
      source_document_id: "doc-1",
    });
  });

  it("sends no source document when the form was filled by hand", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.selectOptions(
      screen.getByTestId("utility-plan-property-select"),
      "prop-1",
    );
    await user.type(screen.getByTestId("utility-plan-provider-input"), "Reliant");
    await user.click(screen.getByTestId("utility-plan-save-button"));

    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    expect(mockCreate.mock.calls[0][0]).not.toHaveProperty("source_document_id");
  });

  it("surfaces terms the form has no field for instead of dropping them", async () => {
    const user = userEvent.setup();
    mockExtract.mockReturnValue({
      unwrap: vi.fn().mockResolvedValue({
        ...DRAFT,
        notes: "Rate assumes autopay enrollment.",
        unrepresented: ["Rate steps to 21.4 c/kWh in months 11-12"],
      }),
    });
    renderDialog();

    await readTheDocument(user);

    // Both live in the folded reference section now. Folded still renders —
    // what the operator does to see it is open a disclosure, not re-read the
    // document.
    await waitFor(() => {
      expect(
        screen.getByText("Rate assumes autopay enrollment."),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByText("Rate steps to 21.4 c/kWh in months 11-12"),
    ).toBeInTheDocument();
  });

  it("puts a minimum usage fee into its input rather than a notice", async () => {
    // It used to land in the can't-hold notice for want of an input. Reading a
    // term the operator then has to re-type by hand is the failure this closes.
    const user = userEvent.setup();
    mockExtract.mockReturnValue({
      unwrap: vi.fn().mockResolvedValue({
        ...DRAFT,
        min_usage_fee_cents: 995,
        min_usage_threshold_kwh: 1000,
      }),
    });
    renderDialog();

    await readTheDocument(user);

    await waitFor(() => {
      expect(screen.getByTestId("utility-plan-min-usage-fee-input")).toHaveValue(9.95);
    });
    expect(screen.getByTestId("utility-plan-min-usage-threshold-input")).toHaveValue(
      1000,
    );
    expect(screen.queryByText("Minimum usage fee: $9.95")).not.toBeInTheDocument();
  });

  it("swaps the metered fields for the internet ones when the service changes", async () => {
    const user = userEvent.setup();
    renderDialog();

    expect(screen.getByTestId("utility-plan-min-usage-fee-input")).toBeInTheDocument();
    expect(screen.queryByTestId("utility-plan-internet-fields")).not.toBeInTheDocument();

    await user.selectOptions(
      screen.getByTestId("utility-plan-service-select"),
      "internet",
    );

    expect(screen.getByTestId("utility-plan-internet-fields")).toBeInTheDocument();
    expect(screen.getByTestId("utility-plan-download-input")).toBeInTheDocument();
    expect(
      screen.queryByTestId("utility-plan-min-usage-fee-input"),
    ).not.toBeInTheDocument();
  });

  it("saves an internet plan's speeds and promo terms", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.selectOptions(
      screen.getByTestId("utility-plan-property-select"),
      "prop-1",
    );
    await user.type(screen.getByTestId("utility-plan-provider-input"), "Spectrum");
    await user.selectOptions(
      screen.getByTestId("utility-plan-service-select"),
      "internet",
    );
    await user.type(screen.getByTestId("utility-plan-download-input"), "1000");
    await user.type(screen.getByTestId("utility-plan-equipment-fee-input"), "15");
    await user.click(screen.getByTestId("utility-plan-save-button"));

    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    expect(mockCreate.mock.calls[0][0]).toMatchObject({
      service_type: "internet",
      download_mbps: 1000,
      equipment_fee_monthly_cents: 1500,
    });
  });

  it("refuses a promo price with no date it takes effect on", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.selectOptions(
      screen.getByTestId("utility-plan-property-select"),
      "prop-1",
    );
    await user.type(screen.getByTestId("utility-plan-provider-input"), "Spectrum");
    await user.selectOptions(
      screen.getByTestId("utility-plan-service-select"),
      "internet",
    );
    await user.type(screen.getByTestId("utility-plan-post-promo-input"), "89.99");
    await user.click(screen.getByTestId("utility-plan-save-button"));

    await waitFor(() =>
      expect(showError).toHaveBeenCalledWith(
        "A post-promo price needs the date the promo ends.",
      ),
    );
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("shows a warning about a field that may be wrong", async () => {
    const user = userEvent.setup();
    mockExtract.mockReturnValue({
      unwrap: vi.fn().mockResolvedValue({
        ...DRAFT,
        warnings: ["The delivery (TDU) charge may no longer be current."],
      }),
    });
    renderDialog();

    await readTheDocument(user);

    await waitFor(() => {
      expect(
        screen.getByText("The delivery (TDU) charge may no longer be current."),
      ).toBeInTheDocument();
    });
  });

  it("leaves the form usable when the reading fails", async () => {
    const user = userEvent.setup();
    mockExtract.mockReturnValue({
      unwrap: vi.fn().mockRejectedValue(new Error("422")),
    });
    renderDialog();

    await readTheDocument(user);

    await waitFor(() => expect(showError).toHaveBeenCalled());
    expect(screen.queryByTestId("utility-plan-draft-notices")).not.toBeInTheDocument();
    expect(screen.getByTestId("utility-plan-save-button")).toBeInTheDocument();
  });

  it("does not call the model until a document is chosen", async () => {
    renderDialog();

    expect(mockExtract).not.toHaveBeenCalled();
    expect(mockExtractUpload).not.toHaveBeenCalled();
  });
});
