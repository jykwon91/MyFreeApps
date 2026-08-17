/**
 * Unit tests for the read-a-document path on the insurance-policy add dialog.
 *
 * Verifies:
 * - Reading a declarations page prefills the form and records what it was read from
 * - Terms the form has no field for are surfaced rather than dropped
 * - A failed reading leaves the operator able to fill the form by hand
 * - Saving without reading anything sends no source_document_id
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AddInsurancePolicyDialog from "@/app/features/insurance/AddInsurancePolicyDialog";
import { FORM_DIALOG_WIDTH_CLASS } from "@/shared/components/ui/form-dialog-width-class";
import { showError } from "@/shared/lib/toast-store";
import type { InsurancePolicyDraft } from "@/shared/types/insurance/insurance-policy-draft";

// ── Mocks ───────────────────────────────────────────────────────────────────

const mockCreate = vi.fn();
const mockExtract = vi.fn();
const mockExtractUpload = vi.fn();

vi.mock("@/shared/store/insurancePoliciesApi", () => ({
  useCreateInsurancePolicyMutation: vi.fn(() => [mockCreate, { isLoading: false }]),
  useExtractInsurancePolicyMutation: vi.fn(() => [mockExtract, { isLoading: false }]),
  useExtractInsurancePolicyFromUploadMutation: vi.fn(() => [
    mockExtractUpload,
    { isLoading: false },
  ]),
}));

vi.mock("@/shared/store/propertiesApi", () => ({
  useGetPropertiesQuery: vi.fn(() => ({
    data: [
      { id: "property-1", name: "6734 Peerless St" },
      { id: "property-2", name: "6738 Peerless St" },
    ],
  })),
}));

vi.mock("@/shared/store/documentsApi", () => ({
  useGetDocumentsQuery: vi.fn(() => ({
    data: [{ id: "doc-1", file_name: "texas-mutual-dec.pdf" }],
  })),
}));

vi.mock("@/shared/lib/toast-store", () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

// ── Test data ────────────────────────────────────────────────────────────────

const DRAFT: InsurancePolicyDraft = {
  source_document_id: "doc-1",
  policy_name: "Landlord Protection — 6734 Peerless St",
  carrier: "Texas Mutual",
  policy_number: "TXM-4471902",
  effective_date: "2026-03-01",
  expiration_date: "2027-03-01",
  coverage_amount_cents: 40_000_000,
  premium_cents: 240_000,
  premium_frequency: "annual",
  fees_and_taxes_cents: 39417,
  deductible_cents: 100_000,
  wind_hail_deductible_pct: "2.00",
  notes: null,
  confidence: "high",
  warnings: [],
  unrepresented: [],
};

function renderDialog(onClose = vi.fn()) {
  render(<AddInsurancePolicyDialog onClose={onClose} />);
  return onClose;
}

async function pickProperty(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(
    screen.getByTestId("insurance-policy-property-select"),
    "property-1",
  );
}

async function readFromLibrary(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(
    screen.getByTestId("insurance-policy-document-select"),
    "doc-1",
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCreate.mockReturnValue({ unwrap: vi.fn().mockResolvedValue({ id: "policy-1" }) });
  mockExtract.mockReturnValue({ unwrap: vi.fn().mockResolvedValue(DRAFT) });
  mockExtractUpload.mockReturnValue({ unwrap: vi.fn().mockResolvedValue(DRAFT) });
});

describe("AddInsurancePolicyDialog — reading a declarations page", () => {
  it("fills the form from what the document said", async () => {
    const user = userEvent.setup();
    renderDialog();

    await readFromLibrary(user);

    await waitFor(() =>
      expect(screen.getByDisplayValue("Texas Mutual")).toBeInTheDocument(),
    );
    expect(screen.getByDisplayValue("TXM-4471902")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2027-03-01")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2400")).toBeInTheDocument();
  });

  it("records which document the saved policy was read from", async () => {
    // Without this the numbers are unattributable — a coverage limit that turns
    // out to be wrong gives no way back to the page it came from.
    const user = userEvent.setup();
    renderDialog();

    await pickProperty(user);
    await readFromLibrary(user);
    await waitFor(() =>
      expect(screen.getByDisplayValue("Texas Mutual")).toBeInTheDocument(),
    );
    await user.click(screen.getByTestId("insurance-policy-save-button"));

    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    expect(mockCreate.mock.calls[0][0]).toMatchObject({
      property_id: "property-1",
      source_document_id: "doc-1",
      carrier: "Texas Mutual",
      coverage_amount_cents: 40_000_000,
      premium_cents: 240_000,
      premium_frequency: "annual",
  fees_and_taxes_cents: 39417,
    });
  });

  it("surfaces terms the document stated that the form has no field for", async () => {
    // Read, returned, and then dropped on the floor is the failure worth
    // preventing — the operator never learns the dec page said it.
    const user = userEvent.setup();
    mockExtract.mockReturnValue({
      unwrap: vi.fn().mockResolvedValue({
        ...DRAFT,
        notes: "Wind/hail excluded on outbuildings",
        unrepresented: ["personal liability limit $300,000"],
        warnings: ["I couldn't tell how often the premium is billed."],
      }),
    });
    renderDialog();

    await readFromLibrary(user);

    const notices = await screen.findByTestId("insurance-policy-draft-notices");
    expect(notices).toHaveTextContent("Wind/hail excluded on outbuildings");
    expect(notices).toHaveTextContent("personal liability limit $300,000");
    expect(notices).toHaveTextContent("how often the premium is billed");
  });

  it("leaves the form usable by hand when the read fails", async () => {
    const user = userEvent.setup();
    mockExtract.mockReturnValue({
      unwrap: vi.fn().mockRejectedValue({ status: 422 }),
    });
    renderDialog();

    await readFromLibrary(user);
    await waitFor(() => expect(showError).toHaveBeenCalled());

    expect(
      screen.queryByTestId("insurance-policy-draft-notices"),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("insurance-policy-save-button")).toBeEnabled();
  });
});

describe("AddInsurancePolicyDialog — typing the policy in by hand", () => {
  it("sends no source_document_id when nothing was read", async () => {
    // The column means "these numbers came off that page". A hand-typed policy
    // citing a document nobody read would be a false provenance record.
    const user = userEvent.setup();
    renderDialog();

    await pickProperty(user);
    await user.type(
      screen.getByPlaceholderText(/Landlord Insurance/i),
      "Landlord Protection",
    );
    await user.click(screen.getByTestId("insurance-policy-save-button"));

    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    expect(mockCreate.mock.calls[0][0]).not.toHaveProperty("source_document_id");
  });

  it("still refuses to save without a policy name", async () => {
    // Reading a document does not relax the one field a policy cannot be
    // stored without — a dec page that names no product still needs one typed.
    const user = userEvent.setup();
    renderDialog();

    await pickProperty(user);
    await user.click(screen.getByTestId("insurance-policy-save-button"));

    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("refuses to save a policy that names no property", async () => {
    // The property is what the policy insures. Saving without one would file
    // coverage against nothing and leave a building silently uninsured.
    const user = userEvent.setup();
    renderDialog();

    await user.type(
      screen.getByPlaceholderText(/Landlord Insurance/i),
      "Landlord Protection",
    );
    await user.click(screen.getByTestId("insurance-policy-save-button"));

    // The select is `required`, so the browser blocks the submit before the
    // handler's own guard is reached — hence no toast to assert on here. Both
    // gates exist: this one keeps the field marked invalid in place, and the
    // guard in `handleSubmit` covers a programmatic submit that skips it.
    expect(mockCreate).not.toHaveBeenCalled();
    expect(
      screen.getByTestId("insurance-policy-property-select"),
    ).toBeInvalid();
  });

  it("gives the form room for its paired fields", () => {
    // The form pairs effective/expiration, premium/billed and the two
    // deductibles two to a row. At the shell's default width those rows have
    // nowhere to sit, and the dialog renders as a narrow ribbon in an
    // otherwise empty viewport.
    renderDialog();

    const panel = screen.getByTestId("add-insurance-policy-dialog")
      .firstElementChild;
    expect(panel).toHaveClass(FORM_DIALOG_WIDTH_CLASS.wide);
  });
});
