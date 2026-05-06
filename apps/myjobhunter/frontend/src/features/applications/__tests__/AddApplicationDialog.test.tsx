/**
 * Tests for the redesigned AddApplicationDialog (2026-05-06).
 *
 * Three-step state machine:
 *   1. INPUT       URL paste (default), JD-text paste, or manual company-name
 *   2. PROCESSING  spinner during the JD extract / parse mutation
 *   3. REVIEW      pre-filled form + company confirmation pill
 *
 * The legacy company `<select>` and the standalone URL field in the
 * form body are GONE. Tests assert on the new shape.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
  Loader2: () => null,
  Building2: () => null,
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
      disabled,
      ...rest
    }: {
      children: React.ReactNode;
      isLoading?: boolean;
      loadingText?: string;
      type?: "button" | "submit" | "reset";
      onClick?: React.MouseEventHandler<HTMLButtonElement>;
      disabled?: boolean;
    } & Record<string, unknown>) => (
      <button
        type={type ?? "button"}
        disabled={isLoading || disabled}
        onClick={onClick}
        {...rest}
      >
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

const mockUseListCompaniesQuery = vi.mocked(useListCompaniesQuery);
const mockUseCreateCompanyMutation = vi.mocked(useCreateCompanyMutation);
const mockUseCreateApplicationMutation = vi.mocked(useCreateApplicationMutation);
const mockUseParseJobDescriptionMutation = vi.mocked(useParseJobDescriptionMutation);
const mockUseExtractJdFromUrlMutation = vi.mocked(useExtractJdFromUrlMutation);

const emptyCompanies = {
  data: { items: [], total: 0 },
  isLoading: false,
  isError: false,
  error: undefined,
} as unknown as ReturnType<typeof useListCompaniesQuery>;

function defaultMutation<T>(): T {
  return [vi.fn(), { isLoading: false }] as unknown as T;
}

function renderDialog(open = true) {
  return render(<AddApplicationDialog open={open} onOpenChange={vi.fn()} />);
}

// ---------------------------------------------------------------------------
// Step 1 → Step 2 → Step 3 — happy paths
// ---------------------------------------------------------------------------

describe("AddApplicationDialog — URL happy path", () => {
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

  it("opens directly into the URL input — no collapsed prompt, no select", () => {
    mockUseExtractJdFromUrlMutation.mockReturnValue(
      defaultMutation<ReturnType<typeof useExtractJdFromUrlMutation>>(),
    );

    renderDialog();

    expect(screen.getByLabelText(/job posting url/i)).toBeInTheDocument();
    // Legacy collapsed prompt is gone.
    expect(screen.queryByText(/paste a link or job description to auto-fill/i)).not.toBeInTheDocument();
    // Legacy company `<select>` is gone.
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("URL → extract → review: pre-fills role title and shows tracked-company pill", async () => {
    const user = userEvent.setup();
    const mockExtract = vi.fn().mockReturnValue({
      unwrap: () =>
        Promise.resolve({
          title: "Senior Engineer",
          company: "Pivotal Health",
          company_website: "https://pivotalhealth.example/",
          company_logo_url: null,
          location: "Remote",
          description_html: null,
          requirements_text: null,
          summary: "Great role.",
          source_url: "https://jobs.example.com/x",
        }),
    });
    const mockCreateCompany = vi.fn();

    mockUseListCompaniesQuery.mockReturnValue({
      data: {
        items: [
          {
            id: "co-existing",
            user_id: "u1",
            name: "Pivotal Health",
            primary_domain: "pivotalhealth.example",
            logo_url: null,
            industry: null,
            size_range: null,
            hq_location: null,
            description: null,
            external_ref: null,
            external_source: null,
            crunchbase_id: null,
            created_at: "",
            updated_at: "",
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

    const urlInput = screen.getByLabelText(/job posting url/i);
    await user.type(urlInput, "https://jobs.example.com/x");
    await user.click(screen.getByRole("button", { name: /auto-fill/i }));

    await waitFor(() => {
      expect(mockExtract).toHaveBeenCalledWith({ url: "https://jobs.example.com/x" });
    });

    // Review step: tracked pill + role title pre-filled. Existing
    // company case → no createCompany call.
    await waitFor(() => {
      expect(screen.getByText(/review and adjust before saving/i)).toBeInTheDocument();
    });
    expect(mockCreateCompany).not.toHaveBeenCalled();
    expect(screen.getByText("Pivotal Health")).toBeInTheDocument();
    expect(screen.getByText(/tracked/i)).toBeInTheDocument();
    expect((screen.getByPlaceholderText(/senior backend engineer/i) as HTMLInputElement).value).toBe(
      "Senior Engineer",
    );
  });

  it("URL → extract → review auto-creates a new company when no match", async () => {
    const user = userEvent.setup();
    const mockExtract = vi.fn().mockReturnValue({
      unwrap: () =>
        Promise.resolve({
          title: "Senior Engineer",
          company: "Pivotal Health",
          company_website: null,
          company_logo_url: null,
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
          id: "co-new",
          user_id: "u1",
          name: "Pivotal Health",
          primary_domain: null,
          logo_url: null,
          industry: null,
          size_range: null,
          hq_location: null,
          description: null,
          external_ref: null,
          external_source: null,
          crunchbase_id: null,
          created_at: "",
          updated_at: "",
        }),
    });

    mockUseListCompaniesQuery.mockReturnValue(emptyCompanies);
    mockUseExtractJdFromUrlMutation.mockReturnValue(
      [mockExtract, { isLoading: false }] as unknown as ReturnType<typeof useExtractJdFromUrlMutation>,
    );
    mockUseCreateCompanyMutation.mockReturnValue(
      [mockCreateCompany, { isLoading: false }] as unknown as ReturnType<typeof useCreateCompanyMutation>,
    );

    renderDialog();
    await user.type(screen.getByLabelText(/job posting url/i), "https://jobs.example.com/x");
    await user.click(screen.getByRole("button", { name: /auto-fill/i }));

    await waitFor(() => {
      expect(mockCreateCompany).toHaveBeenCalledWith({ name: "Pivotal Health" });
    });

    await waitFor(() => {
      expect(screen.getByText("Pivotal Health")).toBeInTheDocument();
    });
    expect(screen.getByText(/added/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Text-paste path
// ---------------------------------------------------------------------------

describe("AddApplicationDialog — text-paste path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCreateApplicationMutation.mockReturnValue(
      defaultMutation<ReturnType<typeof useCreateApplicationMutation>>(),
    );
    mockUseListCompaniesQuery.mockReturnValue(emptyCompanies);
    mockUseExtractJdFromUrlMutation.mockReturnValue(
      defaultMutation<ReturnType<typeof useExtractJdFromUrlMutation>>(),
    );
  });

  it("'No URL?' link switches to JD-text input mode", async () => {
    const user = userEvent.setup();
    mockUseParseJobDescriptionMutation.mockReturnValue(
      defaultMutation<ReturnType<typeof useParseJobDescriptionMutation>>(),
    );
    mockUseCreateCompanyMutation.mockReturnValue(
      defaultMutation<ReturnType<typeof useCreateCompanyMutation>>(),
    );

    renderDialog();
    await user.click(screen.getByText(/no url\? paste the description text instead/i));

    expect(screen.getByLabelText(/job description text/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/job posting url/i)).not.toBeInTheDocument();
  });

  it("text → parse → review pre-fills + auto-creates company", async () => {
    const user = userEvent.setup();
    const mockParse = vi.fn().mockReturnValue({
      unwrap: () =>
        Promise.resolve({
          title: "Senior Engineer",
          company: "Pivotal Health",
          location: "Remote",
          remote_type: "remote",
          salary_min: null,
          salary_max: null,
          salary_currency: null,
          salary_period: null,
          seniority: null,
          must_have_requirements: [],
          nice_to_have_requirements: [],
          responsibilities: [],
          summary: "Great role.",
        }),
    });
    const mockCreateCompany = vi.fn().mockReturnValue({
      unwrap: () =>
        Promise.resolve({
          id: "co-new",
          user_id: "u1",
          name: "Pivotal Health",
          primary_domain: null,
          logo_url: null,
          industry: null,
          size_range: null,
          hq_location: null,
          description: null,
          external_ref: null,
          external_source: null,
          crunchbase_id: null,
          created_at: "",
          updated_at: "",
        }),
    });

    mockUseParseJobDescriptionMutation.mockReturnValue(
      [mockParse, { isLoading: false }] as unknown as ReturnType<typeof useParseJobDescriptionMutation>,
    );
    mockUseCreateCompanyMutation.mockReturnValue(
      [mockCreateCompany, { isLoading: false }] as unknown as ReturnType<typeof useCreateCompanyMutation>,
    );

    renderDialog();
    await user.click(screen.getByText(/no url\? paste the description text instead/i));

    const textarea = screen.getByLabelText(/job description text/i);
    await user.type(textarea, "JD text mentioning Pivotal Health");
    await user.click(screen.getByRole("button", { name: /parse with ai/i }));

    await waitFor(() => {
      expect(mockParse).toHaveBeenCalledWith({ jd_text: "JD text mentioning Pivotal Health" });
    });
    await waitFor(() => {
      expect(mockCreateCompany).toHaveBeenCalledWith({ name: "Pivotal Health" });
    });
    await waitFor(() => {
      expect(screen.getByText(/review and adjust before saving/i)).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Manual company-name path
// ---------------------------------------------------------------------------

describe("AddApplicationDialog — manual company-name path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCreateApplicationMutation.mockReturnValue(
      defaultMutation<ReturnType<typeof useCreateApplicationMutation>>(),
    );
    mockUseListCompaniesQuery.mockReturnValue(emptyCompanies);
    mockUseExtractJdFromUrlMutation.mockReturnValue(
      defaultMutation<ReturnType<typeof useExtractJdFromUrlMutation>>(),
    );
    mockUseParseJobDescriptionMutation.mockReturnValue(
      defaultMutation<ReturnType<typeof useParseJobDescriptionMutation>>(),
    );
  });

  it("'Adding manually?' link switches to combobox; create-on-the-fly transitions to review", async () => {
    const user = userEvent.setup();
    const mockCreateCompany = vi.fn().mockReturnValue({
      unwrap: () =>
        Promise.resolve({
          id: "co-manual",
          user_id: "u1",
          name: "Acme Corp",
          primary_domain: null,
          logo_url: null,
          industry: null,
          size_range: null,
          hq_location: null,
          description: null,
          external_ref: null,
          external_source: null,
          crunchbase_id: null,
          created_at: "",
          updated_at: "",
        }),
    });
    mockUseCreateCompanyMutation.mockReturnValue(
      [mockCreateCompany, { isLoading: false }] as unknown as ReturnType<typeof useCreateCompanyMutation>,
    );

    renderDialog();
    await user.click(screen.getByText(/adding manually\? type a company name/i));

    const input = screen.getByLabelText(/company name/i);
    await user.type(input, "Acme Corp");
    // Press Enter — typed name does not match any existing → triggers create.
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(mockCreateCompany).toHaveBeenCalledWith({ name: "Acme Corp" });
    });
    await waitFor(() => {
      expect(screen.getByText(/review and adjust before saving/i)).toBeInTheDocument();
    });
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Pill click → combobox pre-populated
// ---------------------------------------------------------------------------

describe("AddApplicationDialog — pill change request", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCreateApplicationMutation.mockReturnValue(
      defaultMutation<ReturnType<typeof useCreateApplicationMutation>>(),
    );
    mockUseListCompaniesQuery.mockReturnValue(emptyCompanies);
    mockUseParseJobDescriptionMutation.mockReturnValue(
      defaultMutation<ReturnType<typeof useParseJobDescriptionMutation>>(),
    );
  });

  it("clicking 'not right? change' opens the combobox pre-populated with the extracted name", async () => {
    const user = userEvent.setup();
    const mockExtract = vi.fn().mockReturnValue({
      unwrap: () =>
        Promise.resolve({
          title: "Senior Engineer",
          company: "Pivotal Health",
          company_website: null,
          company_logo_url: null,
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
          id: "co-new",
          user_id: "u1",
          name: "Pivotal Health",
          primary_domain: null,
          logo_url: null,
          industry: null,
          size_range: null,
          hq_location: null,
          description: null,
          external_ref: null,
          external_source: null,
          crunchbase_id: null,
          created_at: "",
          updated_at: "",
        }),
    });

    mockUseExtractJdFromUrlMutation.mockReturnValue(
      [mockExtract, { isLoading: false }] as unknown as ReturnType<typeof useExtractJdFromUrlMutation>,
    );
    mockUseCreateCompanyMutation.mockReturnValue(
      [mockCreateCompany, { isLoading: false }] as unknown as ReturnType<typeof useCreateCompanyMutation>,
    );

    renderDialog();
    await user.type(screen.getByLabelText(/job posting url/i), "https://jobs.example.com/x");
    await user.click(screen.getByRole("button", { name: /auto-fill/i }));

    await waitFor(() => {
      expect(screen.getByText("Pivotal Health")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /not right\? change/i }));

    // Combobox replaces the pill with name pre-populated.
    const comboInput = screen.getByLabelText(/company name/i) as HTMLInputElement;
    expect(comboInput.value).toBe("Pivotal Health");
  });
});

// ---------------------------------------------------------------------------
// Auto-create failure → amber pill + combobox affordance + submit fallback
// ---------------------------------------------------------------------------

describe("AddApplicationDialog — auto-create failure recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseListCompaniesQuery.mockReturnValue(emptyCompanies);
    mockUseParseJobDescriptionMutation.mockReturnValue(
      defaultMutation<ReturnType<typeof useParseJobDescriptionMutation>>(),
    );
  });

  it("renders error pill on auto-create failure; submit fallback retries the create", async () => {
    const user = userEvent.setup();
    const mockExtract = vi.fn().mockReturnValue({
      unwrap: () =>
        Promise.resolve({
          title: "Senior Engineer",
          company: "Flaky Co",
          company_website: null,
          company_logo_url: null,
          location: "Remote",
          description_html: null,
          requirements_text: null,
          summary: null,
          source_url: "https://jobs.example.com/x",
        }),
    });
    // First call rejects (the auto-create from extract), second call succeeds
    // (the submit-time fallback).
    const mockCreateCompany = vi
      .fn()
      .mockReturnValueOnce({
        unwrap: () => Promise.reject(new Error("server boom")),
      })
      .mockReturnValueOnce({
        unwrap: () =>
          Promise.resolve({
            id: "co-retry",
            user_id: "u1",
            name: "Flaky Co",
            primary_domain: null,
            logo_url: null,
            industry: null,
            size_range: null,
            hq_location: null,
            description: null,
            external_ref: null,
            external_source: null,
            crunchbase_id: null,
            created_at: "",
            updated_at: "",
          }),
      });
    const mockCreateApp = vi.fn().mockReturnValue({
      unwrap: () =>
        Promise.resolve({
          id: "app-1",
          company_id: "co-retry",
          role_title: "Senior Engineer",
        }),
    });

    mockUseExtractJdFromUrlMutation.mockReturnValue(
      [mockExtract, { isLoading: false }] as unknown as ReturnType<typeof useExtractJdFromUrlMutation>,
    );
    mockUseCreateCompanyMutation.mockReturnValue(
      [mockCreateCompany, { isLoading: false }] as unknown as ReturnType<typeof useCreateCompanyMutation>,
    );
    mockUseCreateApplicationMutation.mockReturnValue(
      [mockCreateApp, { isLoading: false }] as unknown as ReturnType<typeof useCreateApplicationMutation>,
    );

    renderDialog();
    await user.type(screen.getByLabelText(/job posting url/i), "https://jobs.example.com/x");
    await user.click(screen.getByRole("button", { name: /auto-fill/i }));

    // Amber pill rendered with the error affordance text.
    await waitFor(() => {
      expect(screen.getByText(/needs attention/i)).toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: /couldn't auto-create — type a name/i }),
    ).toBeInTheDocument();

    // Submit triggers the inline retry — second createCompany call succeeds,
    // and the application gets created with the retry's company id.
    await user.click(screen.getByRole("button", { name: /add application/i }));

    await waitFor(() => {
      expect(mockCreateCompany).toHaveBeenCalledTimes(2);
      expect(mockCreateApp).toHaveBeenCalledWith(
        expect.objectContaining({ company_id: "co-retry" }),
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Regression — URL field is removed from the form body
// ---------------------------------------------------------------------------

describe("AddApplicationDialog — removed surfaces", () => {
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
    mockUseExtractJdFromUrlMutation.mockReturnValue(
      defaultMutation<ReturnType<typeof useExtractJdFromUrlMutation>>(),
    );
  });

  it("review form body has no standalone URL field after pre-fill", async () => {
    const user = userEvent.setup();
    const mockExtract = vi.fn().mockReturnValue({
      unwrap: () =>
        Promise.resolve({
          title: "Senior Engineer",
          company: "Acme",
          company_website: null,
          company_logo_url: null,
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
          id: "co-acme",
          user_id: "u1",
          name: "Acme",
          primary_domain: null,
          logo_url: null,
          industry: null,
          size_range: null,
          hq_location: null,
          description: null,
          external_ref: null,
          external_source: null,
          crunchbase_id: null,
          created_at: "",
          updated_at: "",
        }),
    });

    mockUseExtractJdFromUrlMutation.mockReturnValue(
      [mockExtract, { isLoading: false }] as unknown as ReturnType<typeof useExtractJdFromUrlMutation>,
    );
    mockUseCreateCompanyMutation.mockReturnValue(
      [mockCreateCompany, { isLoading: false }] as unknown as ReturnType<typeof useCreateCompanyMutation>,
    );

    renderDialog();
    await user.type(screen.getByLabelText(/job posting url/i), "https://jobs.example.com/x");
    await user.click(screen.getByRole("button", { name: /auto-fill/i }));

    await waitFor(() => {
      expect(screen.getByText(/review and adjust before saving/i)).toBeInTheDocument();
    });

    // The review step shows the source URL in the banner, but there is
    // no standalone URL form field anymore. The only inputs of type=url
    // would be on step 1 (which we left). Since we're on step 3, there
    // should be no url input at all.
    expect(screen.queryByLabelText(/^url$/i)).not.toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText("https://..."),
    ).not.toBeInTheDocument();
  });
});
