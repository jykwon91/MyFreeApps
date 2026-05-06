/**
 * Smoke tests for AddApplicationDialog.
 *
 * Three scenario groups:
 * - Inline company-create flow (existing — "+ New" panel)
 * - JD paste-text flow (existing — "Paste the description" tab + AI parse)
 * - JD URL-extract flow (new — "Paste a link" tab + Fetch button)
 *
 * Each group mocks the RTK Query hooks at the module boundary; no real
 * network calls. The radix Dialog and lucide-react icons are stubbed so
 * jsdom doesn't choke on the SVG children.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AddApplicationDialog from "../AddApplicationDialog";

// ---- mocks ----

vi.mock("lucide-react", () => ({
  X: () => null,
  Plus: () => null,
  Sparkles: () => null,
  ChevronDown: () => null,
  ChevronUp: () => null,
  Download: () => null,
  FileText: () => null,
  Link: () => null,
}));

vi.mock("@/lib/companiesApi", () => ({
  useListCompaniesQuery: vi.fn(),
  useCreateCompanyMutation: vi.fn(),
  useTriggerCompanyResearchMutation: vi.fn(() => [
    vi.fn(() => ({ unwrap: () => Promise.resolve(undefined) })),
    { isLoading: false },
  ]),
}));

vi.mock("@/lib/applicationsApi", () => ({
  useCreateApplicationMutation: vi.fn(),
  useParseJobDescriptionMutation: vi.fn(),
  useExtractJdFromUrlMutation: vi.fn(),
}));

vi.mock("@radix-ui/react-dialog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@radix-ui/react-dialog")>();
  return {
    ...actual,
    Portal: ({ children }: { children: React.ReactNode }) => children,
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
import {
  useCreateApplicationMutation,
  useExtractJdFromUrlMutation,
  useParseJobDescriptionMutation,
} from "@/lib/applicationsApi";
import { showSuccess } from "@platform/ui";

const mockUseListCompaniesQuery = vi.mocked(useListCompaniesQuery);
const mockUseCreateCompanyMutation = vi.mocked(useCreateCompanyMutation);
const mockUseCreateApplicationMutation = vi.mocked(useCreateApplicationMutation);
const mockUseParseJobDescriptionMutation = vi.mocked(useParseJobDescriptionMutation);
const mockUseExtractJdFromUrlMutation = vi.mocked(useExtractJdFromUrlMutation);
const mockShowSuccess = vi.mocked(showSuccess);

const emptyCompanies = {
  data: { items: [], total: 0 },
  isLoading: false,
  isError: false,
  error: undefined,
} as unknown as ReturnType<typeof useListCompaniesQuery>;

// Default mutation state — never called unless the test sets a specific
// return value via `.mockReturnValue` again.
function defaultMutation<T>(): T {
  return [vi.fn(), { isLoading: false }] as unknown as T;
}

describe("AddApplicationDialog — inline company create", () => {
  const mockOnOpenChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCreateApplicationMutation.mockReturnValue(
      defaultMutation<ReturnType<typeof useCreateApplicationMutation>>(),
    );
    mockUseParseJobDescriptionMutation.mockReturnValue(
      defaultMutation<ReturnType<typeof useParseJobDescriptionMutation>>(),
    );
    mockUseExtractJdFromUrlMutation.mockReturnValue(
      defaultMutation<ReturnType<typeof useExtractJdFromUrlMutation>>(),
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
      defaultMutation<ReturnType<typeof useCreateCompanyMutation>>(),
    );

    renderDialog();

    expect(screen.getByRole("button", { name: /add new company/i })).toBeInTheDocument();
    expect(screen.queryByText("New company")).not.toBeInTheDocument();
  });

  it("opens the inline CompanyForm panel when '+ New' is clicked", async () => {
    const user = userEvent.setup();
    mockUseListCompaniesQuery.mockReturnValue(emptyCompanies);
    mockUseCreateCompanyMutation.mockReturnValue(
      defaultMutation<ReturnType<typeof useCreateCompanyMutation>>(),
    );

    renderDialog();

    await user.click(screen.getByRole("button", { name: /add new company/i }));

    expect(screen.getByText("New company")).toBeInTheDocument();
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

    await user.click(within(companyPanel).getByRole("button", { name: /cancel/i }));

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

    mockUseListCompaniesQuery.mockReturnValue(emptyCompanies);
    mockUseCreateCompanyMutation.mockReturnValue(
      [mockCreate, { isLoading: false }] as unknown as ReturnType<typeof useCreateCompanyMutation>,
    );

    renderDialog();

    await user.click(screen.getByRole("button", { name: /add new company/i }));
    await user.type(screen.getByLabelText(/name/i), "New Corp");
    await user.click(screen.getByRole("button", { name: /create company/i }));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith({
        name: "New Corp",
        primary_domain: null,
        industry: null,
        hq_location: null,
      });
      expect(mockShowSuccess).toHaveBeenCalledWith('Company "New Corp" created');
    });

    await waitFor(() => {
      expect(screen.queryByText("New company")).not.toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Paste-text flow — existing JD AI parse path
// ---------------------------------------------------------------------------

describe("AddApplicationDialog — JD paste-text flow", () => {
  const mockOnOpenChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCreateApplicationMutation.mockReturnValue(
      defaultMutation<ReturnType<typeof useCreateApplicationMutation>>(),
    );
    mockUseListCompaniesQuery.mockReturnValue(emptyCompanies);
    mockUseCreateCompanyMutation.mockReturnValue(
      defaultMutation<ReturnType<typeof useCreateCompanyMutation>>(),
    );
    mockUseExtractJdFromUrlMutation.mockReturnValue(
      defaultMutation<ReturnType<typeof useExtractJdFromUrlMutation>>(),
    );
  });

  function renderDialog(open = true) {
    return render(<AddApplicationDialog open={open} onOpenChange={mockOnOpenChange} />);
  }

  it("shows the collapsed auto-fill prompt by default", () => {
    mockUseParseJobDescriptionMutation.mockReturnValue(
      defaultMutation<ReturnType<typeof useParseJobDescriptionMutation>>(),
    );

    renderDialog();

    expect(screen.getByText(/paste a link or job description to auto-fill/i)).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /job description text/i })).not.toBeInTheDocument();
  });

  it("expanding the panel defaults to the URL tab", async () => {
    const user = userEvent.setup();
    mockUseParseJobDescriptionMutation.mockReturnValue(
      defaultMutation<ReturnType<typeof useParseJobDescriptionMutation>>(),
    );

    renderDialog();

    await user.click(screen.getByText(/paste a link or job description to auto-fill/i));

    // URL tab is the default — the URL input should be visible.
    expect(screen.getByLabelText(/job posting url/i)).toBeInTheDocument();
    // The text-tab textarea is NOT visible until the user switches.
    expect(screen.queryByRole("textbox", { name: /job description text/i })).not.toBeInTheDocument();
  });

  it("switching to text tab shows the JD textarea", async () => {
    const user = userEvent.setup();
    mockUseParseJobDescriptionMutation.mockReturnValue(
      defaultMutation<ReturnType<typeof useParseJobDescriptionMutation>>(),
    );

    renderDialog();

    await user.click(screen.getByText(/paste a link or job description to auto-fill/i));
    await user.click(screen.getByRole("tab", { name: /paste the description/i }));

    expect(screen.getByRole("textbox", { name: /job description text/i })).toBeInTheDocument();
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

    await user.click(screen.getByText(/paste a link or job description to auto-fill/i));
    await user.click(screen.getByRole("tab", { name: /paste the description/i }));

    const textarea = screen.getByRole("textbox", { name: /job description text/i });
    await user.type(textarea, "Senior Engineer at Acme Corp");

    await user.click(screen.getByRole("button", { name: /parse with ai/i }));

    await waitFor(() => {
      expect(mockParse).toHaveBeenCalledWith({ jd_text: "Senior Engineer at Acme Corp" });
    });

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

    await user.click(screen.getByText(/paste a link or job description to auto-fill/i));
    await user.click(screen.getByRole("tab", { name: /paste the description/i }));

    const textarea = screen.getByRole("textbox", { name: /job description text/i });
    await user.type(textarea, "Some JD text");

    await user.click(screen.getByRole("button", { name: /parse with ai/i }));

    await waitFor(() => {
      expect(screen.getByText(/couldn't auto-fill/i)).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// New: paste-link flow — JD URL extract path
// ---------------------------------------------------------------------------

describe("AddApplicationDialog — JD paste-link flow", () => {
  const mockOnOpenChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCreateApplicationMutation.mockReturnValue(
      defaultMutation<ReturnType<typeof useCreateApplicationMutation>>(),
    );
    mockUseListCompaniesQuery.mockReturnValue(emptyCompanies);
    mockUseCreateCompanyMutation.mockReturnValue(
      defaultMutation<ReturnType<typeof useCreateCompanyMutation>>(),
    );
    mockUseParseJobDescriptionMutation.mockReturnValue(
      defaultMutation<ReturnType<typeof useParseJobDescriptionMutation>>(),
    );
  });

  function renderDialog(open = true) {
    return render(<AddApplicationDialog open={open} onOpenChange={mockOnOpenChange} />);
  }

  it("calls extractJdFromUrl when 'Fetch and auto-fill' is clicked", async () => {
    const user = userEvent.setup();
    const mockExtract = vi.fn().mockReturnValue({
      unwrap: () =>
        Promise.resolve({
          title: "Senior Backend Engineer",
          company: "Acme Corp",
          location: "San Francisco, CA, US",
          description_html: "<p>Build APIs at scale.</p>",
          requirements_text: "Must have:\n- Python",
          summary: null,
          source_url: "https://jobs.example.com/abc",
        }),
    });

    mockUseExtractJdFromUrlMutation.mockReturnValue(
      [mockExtract, { isLoading: false }] as unknown as ReturnType<typeof useExtractJdFromUrlMutation>,
    );

    renderDialog();

    await user.click(screen.getByText(/paste a link or job description to auto-fill/i));

    // URL tab is default. Type a URL and click fetch.
    const urlInput = screen.getByLabelText(/job posting url/i);
    await user.type(urlInput, "https://jobs.example.com/abc");

    await user.click(screen.getByRole("button", { name: /fetch and auto-fill/i }));

    await waitFor(() => {
      expect(mockExtract).toHaveBeenCalledWith({ url: "https://jobs.example.com/abc" });
    });

    await waitFor(() => {
      expect(screen.getByText(/fields pre-filled from jd/i)).toBeInTheDocument();
    });
    // Source URL is shown in the success banner.
    expect(screen.getByText(/fetched from/i)).toBeInTheDocument();
  });

  it("shows authRequired banner with 'switch to paste-text' affordance on 422 auth_required", async () => {
    const user = userEvent.setup();
    const mockExtract = vi.fn().mockReturnValue({
      // RTK Query rejects with the error shape from axiosBaseQuery.
      unwrap: () =>
        Promise.reject({
          status: 422,
          data: { detail: "auth_required" },
        }),
    });

    mockUseExtractJdFromUrlMutation.mockReturnValue(
      [mockExtract, { isLoading: false }] as unknown as ReturnType<typeof useExtractJdFromUrlMutation>,
    );

    renderDialog();

    await user.click(screen.getByText(/paste a link or job description to auto-fill/i));

    const urlInput = screen.getByLabelText(/job posting url/i);
    await user.type(urlInput, "https://www.linkedin.com/jobs/view/123");

    await user.click(screen.getByRole("button", { name: /fetch and auto-fill/i }));

    await waitFor(() => {
      expect(screen.getByText(/couldn't reach this page/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /paste the description text instead/i })).toBeInTheDocument();
  });

  it("clicking 'paste the description text instead' switches to the text tab", async () => {
    const user = userEvent.setup();
    const mockExtract = vi.fn().mockReturnValue({
      unwrap: () =>
        Promise.reject({
          status: 422,
          data: { detail: "auth_required" },
        }),
    });

    mockUseExtractJdFromUrlMutation.mockReturnValue(
      [mockExtract, { isLoading: false }] as unknown as ReturnType<typeof useExtractJdFromUrlMutation>,
    );

    renderDialog();

    await user.click(screen.getByText(/paste a link or job description to auto-fill/i));

    const urlInput = screen.getByLabelText(/job posting url/i);
    await user.type(urlInput, "https://www.linkedin.com/jobs/view/123");

    await user.click(screen.getByRole("button", { name: /fetch and auto-fill/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /paste the description text instead/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /paste the description text instead/i }));

    // Text tab is now active — the textarea is visible.
    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: /job description text/i })).toBeInTheDocument();
    });
  });

  it("shows generic error banner on 502 / 504 / network failures", async () => {
    const user = userEvent.setup();
    const mockExtract = vi.fn().mockReturnValue({
      unwrap: () =>
        Promise.reject({ status: 504, data: "Gateway timeout" }),
    });

    mockUseExtractJdFromUrlMutation.mockReturnValue(
      [mockExtract, { isLoading: false }] as unknown as ReturnType<typeof useExtractJdFromUrlMutation>,
    );

    renderDialog();

    await user.click(screen.getByText(/paste a link or job description to auto-fill/i));

    const urlInput = screen.getByLabelText(/job posting url/i);
    await user.type(urlInput, "https://slow.example.com/job");

    await user.click(screen.getByRole("button", { name: /fetch and auto-fill/i }));

    await waitFor(() => {
      expect(screen.getByText(/couldn't auto-fill/i)).toBeInTheDocument();
    });
    // Specific 504 wording.
    expect(screen.getByText(/took too long/i)).toBeInTheDocument();
  });

  it("auto-creates the company on extract when no match exists", async () => {
    const user = userEvent.setup();
    const mockExtract = vi.fn().mockReturnValue({
      unwrap: () =>
        Promise.resolve({
          title: "Senior Engineer",
          company: "Pivotal Health",
          location: "Remote",
          description_html: null,
          requirements_text: null,
          summary: null,
          source_url: "https://jobs.example.com/x",
        }),
    });
    const mockCreateCompany = vi.fn().mockReturnValue({
      unwrap: () =>
        Promise.resolve({
          id: "co-123",
          name: "Pivotal Health",
          primary_domain: null,
          logo_url: null,
          industry: null,
          size_range: null,
          notes: null,
          deleted_at: null,
        }),
    });

    // Empty companies list → must auto-create.
    mockUseListCompaniesQuery.mockReturnValue(emptyCompanies);
    mockUseExtractJdFromUrlMutation.mockReturnValue(
      [mockExtract, { isLoading: false }] as unknown as ReturnType<typeof useExtractJdFromUrlMutation>,
    );
    mockUseCreateCompanyMutation.mockReturnValue(
      [mockCreateCompany, { isLoading: false }] as unknown as ReturnType<typeof useCreateCompanyMutation>,
    );

    renderDialog();
    await user.click(screen.getByText(/paste a link or job description to auto-fill/i));
    const urlInput = screen.getByLabelText(/job posting url/i);
    await user.type(urlInput, "https://jobs.example.com/x");
    await user.click(screen.getByRole("button", { name: /fetch and auto-fill/i }));

    await waitFor(() => {
      expect(mockCreateCompany).toHaveBeenCalledWith({ name: "Pivotal Health" });
    });
  });

  it("auto-selects an existing company on extract (case-insensitive)", async () => {
    const user = userEvent.setup();
    const mockExtract = vi.fn().mockReturnValue({
      unwrap: () =>
        Promise.resolve({
          title: "Senior Engineer",
          company: "PIVOTAL HEALTH",
          location: "Remote",
          description_html: null,
          requirements_text: null,
          summary: null,
          source_url: "https://jobs.example.com/x",
        }),
    });
    const mockCreateCompany = vi.fn();

    // Existing companies — one matches case-insensitively.
    mockUseListCompaniesQuery.mockReturnValue({
      data: {
        items: [
          {
            id: "co-existing",
            name: "Pivotal Health",
            primary_domain: null,
            logo_url: null,
            industry: null,
            size_range: null,
            notes: null,
            deleted_at: null,
          },
        ],
        total: 1,
      },
      isLoading: false,
      isError: false,
      error: undefined,
    } as unknown as ReturnType<typeof useListCompaniesQuery>);
    mockUseExtractJdFromUrlMutation.mockReturnValue(
      [mockExtract, { isLoading: false }] as unknown as ReturnType<typeof useExtractJdFromUrlMutation>,
    );
    mockUseCreateCompanyMutation.mockReturnValue(
      [mockCreateCompany, { isLoading: false }] as unknown as ReturnType<typeof useCreateCompanyMutation>,
    );

    renderDialog();
    await user.click(screen.getByText(/paste a link or job description to auto-fill/i));
    const urlInput = screen.getByLabelText(/job posting url/i);
    await user.type(urlInput, "https://jobs.example.com/x");
    await user.click(screen.getByRole("button", { name: /fetch and auto-fill/i }));

    // Wait for pre-fill to land — role title becomes visible
    await waitFor(() => {
      expect(screen.getByText(/fields pre-filled from jd/i)).toBeInTheDocument();
    });

    // No createCompany call — existing one was found case-insensitively
    expect(mockCreateCompany).not.toHaveBeenCalled();
    // The company select should now have the matched company chosen.
    // (There are multiple comboboxes in the dialog; pick the one with
    // the company name as a visible option.)
    const companyOption = screen.getByRole("option", {
      name: "Pivotal Health",
    }) as HTMLOptionElement;
    expect(companyOption.selected).toBe(true);
  });

  it("preserves typed URL when switching to text tab and back", async () => {
    const user = userEvent.setup();
    mockUseExtractJdFromUrlMutation.mockReturnValue(
      defaultMutation<ReturnType<typeof useExtractJdFromUrlMutation>>(),
    );

    renderDialog();

    await user.click(screen.getByText(/paste a link or job description to auto-fill/i));

    const urlInput = screen.getByLabelText(/job posting url/i);
    await user.type(urlInput, "https://jobs.example.com/abc");

    // Switch to text tab.
    await user.click(screen.getByRole("tab", { name: /paste the description/i }));
    expect(screen.queryByLabelText(/job posting url/i)).not.toBeInTheDocument();

    // Switch back.
    await user.click(screen.getByRole("tab", { name: /paste a link/i }));

    // URL is still there.
    const restored = screen.getByLabelText(/job posting url/i) as HTMLInputElement;
    expect(restored.value).toBe("https://jobs.example.com/abc");
  });
});
