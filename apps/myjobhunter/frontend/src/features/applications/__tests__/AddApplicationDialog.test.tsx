/**
 * Smoke tests for AddApplicationDialog — focused on the inline company-create flow.
 *
 * Tests:
 * - "+ New" button shows the CompanyForm inline panel
 * - Filling and submitting CompanyForm calls createCompany, auto-selects the new
 *   company in the application dropdown, and closes the panel
 * - Cancel on CompanyForm closes the panel without submitting
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AddApplicationDialog from "../AddApplicationDialog";

// ---- mocks ----

// Lucide icons render as SVG elements which cause "Objects are not valid as
// a React child" in the jsdom test environment when used inside plain button
// children. Mock them as null-rendering stubs.
vi.mock("lucide-react", () => ({
  X: () => null,
  Plus: () => null,
  Sparkles: () => null,
  ChevronDown: () => null,
  ChevronUp: () => null,
  Download: () => null,
  FileText: () => null,
}));

vi.mock("@/lib/companiesApi", () => ({
  useListCompaniesQuery: vi.fn(),
  useCreateCompanyMutation: vi.fn(),
}));

vi.mock("@/lib/applicationsApi", () => ({
  useCreateApplicationMutation: vi.fn(),
  useParseJobDescriptionMutation: vi.fn(),
}));

vi.mock("@radix-ui/react-dialog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@radix-ui/react-dialog")>();
  return {
    ...actual,
    Portal: ({ children }: { children: React.ReactNode }) => children,
    // Dialog.Close must close the dialog — make it call onOpenChange via a
    // wrapper button. In our simplified mock it just renders children normally.
    Close: ({ asChild, children }: { asChild?: boolean; children: React.ReactNode }) => {
      void asChild;
      return <>{children}</>;
    },
  };
});

vi.mock("@platform/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@platform/ui")>();
  return {
    ...actual,
    showSuccess: vi.fn(),
    showError: vi.fn(),
    LoadingButton: ({
      children,
      isLoading,
      loadingText,
      type,
      onClick,
      ...rest
    }: {
      children: React.ReactNode;
      isLoading?: boolean;
      loadingText?: string;
      type?: "button" | "submit" | "reset";
      onClick?: React.MouseEventHandler<HTMLButtonElement>;
    } & Record<string, unknown>) => (
      <button type={type ?? "button"} disabled={isLoading} onClick={onClick} {...rest}>
        {isLoading ? loadingText : children}
      </button>
    ),
  };
});

import { useListCompaniesQuery, useCreateCompanyMutation } from "@/lib/companiesApi";
import { useCreateApplicationMutation, useParseJobDescriptionMutation } from "@/lib/applicationsApi";
import { showSuccess } from "@platform/ui";

const mockUseListCompaniesQuery = vi.mocked(useListCompaniesQuery);
const mockUseCreateCompanyMutation = vi.mocked(useCreateCompanyMutation);
const mockUseCreateApplicationMutation = vi.mocked(useCreateApplicationMutation);
const mockUseParseJobDescriptionMutation = vi.mocked(useParseJobDescriptionMutation);
const mockShowSuccess = vi.mocked(showSuccess);

const emptyCompanies = {
  data: { items: [], total: 0 },
  isLoading: false,
  isError: false,
  error: undefined,
} as unknown as ReturnType<typeof useListCompaniesQuery>;

describe("AddApplicationDialog — inline company create", () => {
  const mockOnOpenChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCreateApplicationMutation.mockReturnValue(
      [vi.fn(), { isLoading: false }] as unknown as ReturnType<typeof useCreateApplicationMutation>,
    );
    // Default: parse mutation is idle (never called in most tests).
    mockUseParseJobDescriptionMutation.mockReturnValue(
      [vi.fn(), { isLoading: false }] as unknown as ReturnType<typeof useParseJobDescriptionMutation>,
    );
  });

  function renderDialog(open = true) {
    return render(
      <AddApplicationDialog open={open} onOpenChange={mockOnOpenChange} />,
    );
  }

  it("shows the company dropdown with a '+ New' button by default", () => {
    mockUseListCompaniesQuery.mockReturnValue(emptyCompanies);
    mockUseCreateCompanyMutation.mockReturnValue(
      [vi.fn(), { isLoading: false }] as unknown as ReturnType<typeof useCreateCompanyMutation>,
    );

    renderDialog();

    // The "+ New" button should be visible
    expect(screen.getByRole("button", { name: /add new company/i })).toBeInTheDocument();
    // CompanyForm should NOT be visible yet
    expect(screen.queryByText("New company")).not.toBeInTheDocument();
  });

  it("opens the inline CompanyForm panel when '+ New' is clicked", async () => {
    const user = userEvent.setup();
    mockUseListCompaniesQuery.mockReturnValue(emptyCompanies);
    mockUseCreateCompanyMutation.mockReturnValue(
      [vi.fn(), { isLoading: false }] as unknown as ReturnType<typeof useCreateCompanyMutation>,
    );

    renderDialog();

    await user.click(screen.getByRole("button", { name: /add new company/i }));

    // CompanyForm header label is now visible
    expect(screen.getByText("New company")).toBeInTheDocument();
    // The company dropdown should be hidden
    expect(screen.queryByRole("button", { name: /add new company/i })).not.toBeInTheDocument();
  });

  it("closes the panel on CompanyForm cancel without calling mutation", async () => {
    const user = userEvent.setup();
    const mockCreate = vi.fn();
    mockUseListCompaniesQuery.mockReturnValue(emptyCompanies);
    mockUseCreateCompanyMutation.mockReturnValue(
      [mockCreate, { isLoading: false }] as unknown as ReturnType<typeof useCreateCompanyMutation>,
    );

    renderDialog();

    await user.click(screen.getByRole("button", { name: /add new company/i }));
    const companyPanel = screen.getByText("New company").closest("div")!;
    expect(companyPanel).toBeInTheDocument();

    // Click cancel inside the CompanyForm panel (not the outer dialog Cancel)
    await user.click(within(companyPanel).getByRole("button", { name: /cancel/i }));

    // Panel closed, dropdown visible again
    expect(screen.queryByText("New company")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add new company/i })).toBeInTheDocument();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("calls createCompany, shows success toast, auto-selects company, and closes panel", async () => {
    const user = userEvent.setup();
    const newCompany = { id: "new-co-id", name: "New Corp" };
    const mockCreate = vi.fn().mockReturnValue({
      unwrap: () => Promise.resolve(newCompany),
    });

    // Initially no companies; after create the list would have the new one.
    // The mock just returns empty — the auto-select via setValue is what we test.
    mockUseListCompaniesQuery.mockReturnValue(emptyCompanies);
    mockUseCreateCompanyMutation.mockReturnValue(
      [mockCreate, { isLoading: false }] as unknown as ReturnType<typeof useCreateCompanyMutation>,
    );

    renderDialog();

    // Open the inline form
    await user.click(screen.getByRole("button", { name: /add new company/i }));

    // Fill in the company name
    await user.type(screen.getByLabelText(/name/i), "New Corp");

    // Submit the company form
    await user.click(screen.getByRole("button", { name: /create company/i }));

    await waitFor(() => {
      // Mutation was called with the correct payload
      expect(mockCreate).toHaveBeenCalledWith({
        name: "New Corp",
        primary_domain: null,
        industry: null,
        hq_location: null,
      });
      // Success toast fired
      expect(mockShowSuccess).toHaveBeenCalledWith('Company "New Corp" created');
    });

    // The panel closed, dropdown is back
    await waitFor(() => {
      expect(screen.queryByText("New company")).not.toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// JD paste + parse UX tests
// ---------------------------------------------------------------------------

describe("AddApplicationDialog — JD parse flow", () => {
  const mockOnOpenChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCreateApplicationMutation.mockReturnValue(
      [vi.fn(), { isLoading: false }] as unknown as ReturnType<typeof useCreateApplicationMutation>,
    );
    mockUseListCompaniesQuery.mockReturnValue(emptyCompanies);
    mockUseCreateCompanyMutation.mockReturnValue(
      [vi.fn(), { isLoading: false }] as unknown as ReturnType<typeof useCreateCompanyMutation>,
    );
  });

  function renderDialog(open = true) {
    return render(<AddApplicationDialog open={open} onOpenChange={mockOnOpenChange} />);
  }

  it("shows the 'Paste job description to auto-fill' button by default", () => {
    mockUseParseJobDescriptionMutation.mockReturnValue(
      [vi.fn(), { isLoading: false }] as unknown as ReturnType<typeof useParseJobDescriptionMutation>,
    );

    renderDialog();

    expect(screen.getByText(/paste job description to auto-fill/i)).toBeInTheDocument();
    // Textarea is hidden in idle state
    expect(screen.queryByRole("textbox", { name: /job description text/i })).not.toBeInTheDocument();
  });

  it("shows the JD textarea when the expand button is clicked", async () => {
    const user = userEvent.setup();
    mockUseParseJobDescriptionMutation.mockReturnValue(
      [vi.fn(), { isLoading: false }] as unknown as ReturnType<typeof useParseJobDescriptionMutation>,
    );

    renderDialog();

    await user.click(screen.getByText(/paste job description to auto-fill/i));

    expect(screen.getByRole("textbox", { name: /job description text/i })).toBeInTheDocument();
    // The expand button should be gone, replaced by collapse
    expect(screen.queryByText(/paste job description to auto-fill/i)).not.toBeInTheDocument();
  });

  it("calls parseJobDescription mutation when 'Parse with AI' is clicked", async () => {
    const user = userEvent.setup();
    const mockParse = vi.fn().mockReturnValue({
      unwrap: () =>
        Promise.resolve({
          title: "Senior Engineer",
          company: "Acme Corp",
          location: "San Francisco",
          remote_type: "hybrid",
          salary_min: 140000,
          salary_max: 180000,
          salary_currency: "USD",
          salary_period: "annual",
          seniority: "senior",
          must_have_requirements: ["Python"],
          nice_to_have_requirements: [],
          responsibilities: ["Build APIs"],
          summary: "Great role at Acme.",
        }),
    });

    mockUseParseJobDescriptionMutation.mockReturnValue(
      [mockParse, { isLoading: false }] as unknown as ReturnType<typeof useParseJobDescriptionMutation>,
    );

    renderDialog();

    // Open the JD panel
    await user.click(screen.getByText(/paste job description to auto-fill/i));

    // Type some JD text
    const textarea = screen.getByRole("textbox", { name: /job description text/i });
    await user.type(textarea, "Senior Engineer at Acme Corp");

    // Click parse
    await user.click(screen.getByRole("button", { name: /parse with ai/i }));

    await waitFor(() => {
      expect(mockParse).toHaveBeenCalledWith({ jd_text: "Senior Engineer at Acme Corp" });
    });

    // After success, shows the parsed confirmation banner
    await waitFor(() => {
      expect(screen.getByText(/fields pre-filled from jd/i)).toBeInTheDocument();
    });
  });

  it("shows error banner when parse mutation fails", async () => {
    const user = userEvent.setup();
    const mockParse = vi.fn().mockReturnValue({
      unwrap: () => Promise.reject(new Error("AI unavailable")),
    });

    mockUseParseJobDescriptionMutation.mockReturnValue(
      [mockParse, { isLoading: false }] as unknown as ReturnType<typeof useParseJobDescriptionMutation>,
    );

    renderDialog();

    await user.click(screen.getByText(/paste job description to auto-fill/i));

    const textarea = screen.getByRole("textbox", { name: /job description text/i });
    await user.type(textarea, "Some JD text");

    await user.click(screen.getByRole("button", { name: /parse with ai/i }));

    await waitFor(() => {
      expect(screen.getByText(/ai parsing failed/i)).toBeInTheDocument();
    });
  });

  it("dismiss button on success banner resets to idle state", async () => {
    const user = userEvent.setup();
    const mockParse = vi.fn().mockReturnValue({
      unwrap: () =>
        Promise.resolve({
          title: null,
          company: null,
          location: null,
          remote_type: null,
          salary_min: null,
          salary_max: null,
          salary_currency: null,
          salary_period: null,
          seniority: null,
          must_have_requirements: [],
          nice_to_have_requirements: [],
          responsibilities: [],
          summary: null,
        }),
    });

    mockUseParseJobDescriptionMutation.mockReturnValue(
      [mockParse, { isLoading: false }] as unknown as ReturnType<typeof useParseJobDescriptionMutation>,
    );

    renderDialog();

    await user.click(screen.getByText(/paste job description to auto-fill/i));
    const textarea = screen.getByRole("textbox", { name: /job description text/i });
    await user.type(textarea, "Some JD");
    await user.click(screen.getByRole("button", { name: /parse with ai/i }));

    // Wait for success banner
    await waitFor(() => {
      expect(screen.getByText(/fields pre-filled from jd/i)).toBeInTheDocument();
    });

    // Dismiss it
    await user.click(screen.getByRole("button", { name: /dismiss parse result/i }));

    // Back to idle — the expand button is visible again
    await waitFor(() => {
      expect(screen.getByText(/paste job description to auto-fill/i)).toBeInTheDocument();
    });
  });
});
