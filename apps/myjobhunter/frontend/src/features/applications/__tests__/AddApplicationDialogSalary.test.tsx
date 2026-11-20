/**
 * The salary a pasted job description gives is shown on the review step,
 * can be changed there, and is sent with the application; a posting with
 * no salary sends none. A range whose top is below its bottom is refused.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ADD_APPLICATION_FORM_PROBLEMS as PROBLEMS } from "@myjobhunter/api-client/constants/addApplicationForm";
import type { JdParseResponse } from "@myjobhunter/api-client/types/application/jd-parse-response";
import type { Company } from "@myjobhunter/api-client/types/company";
import AddApplicationDialog from "../AddApplicationDialog";

const ACME: Company = {
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
};

const PARSE: JdParseResponse = {
  title: "Staff Engineer",
  company: "Acme",
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
};

const parseMock = vi.fn();
const createApplicationMock = vi.fn();

vi.mock("@myjobhunter/api-client/store/companiesApi", () => ({
  useListCompaniesQuery: () => ({ data: { items: [ACME], total: 1 }, isLoading: false, isError: false }),
  useLazyListCompaniesQuery: () => [vi.fn(() => ({ unwrap: () => Promise.resolve({ items: [ACME], total: 1 }) }))],
  useCreateCompanyMutation: () => [vi.fn(), { isLoading: false }],
  useTriggerCompanyResearchMutation: () => [vi.fn(() => ({ unwrap: () => Promise.resolve(undefined) })), { isLoading: false }],
}));

vi.mock("@myjobhunter/api-client/store/applicationsApi", () => ({
  useCreateApplicationMutation: () => [createApplicationMock, { isLoading: false }],
  useParseJobDescriptionMutation: () => [parseMock, { isLoading: false }],
  useExtractJdFromUrlMutation: () => [vi.fn(), { isLoading: false }],
}));

vi.mock("@radix-ui/react-dialog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@radix-ui/react-dialog")>();
  return { ...actual, Portal: ({ children }: { children: React.ReactNode }) => children };
});

async function pasteAndReview(result: JdParseResponse) {
  parseMock.mockReturnValue({ unwrap: () => Promise.resolve(result) });
  const user = userEvent.setup();
  render(<AddApplicationDialog open onOpenChange={vi.fn()} />);
  await user.click(screen.getByText(/no url\? paste the description text instead/i));
  await user.type(screen.getByLabelText(/job description text/i), "Staff Engineer at Acme");
  await user.click(screen.getByRole("button", { name: /parse with ai/i }));
  await screen.findByText(/review and adjust before saving/i);
  return user;
}

function salaryFrom(): HTMLInputElement {
  return screen.getByLabelText(/^salary from/i) as HTMLInputElement;
}

function salaryTo(): HTMLInputElement {
  return screen.getByLabelText(/^salary to/i) as HTMLInputElement;
}

function salaryPer(): HTMLSelectElement {
  return screen.getByLabelText(/^per$/i) as HTMLSelectElement;
}

describe("AddApplicationDialog — posted salary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createApplicationMock.mockReturnValue({ unwrap: () => Promise.resolve({ id: "app-1" }) });
  });

  it("shows the parsed salary on the review step and sends it", async () => {
    const user = await pasteAndReview({ ...PARSE, salary_min: 120000, salary_max: 150000, salary_currency: "EUR", salary_period: "annual" });

    expect(salaryFrom().value).toBe("120000");
    expect(salaryTo().value).toBe("150000");
    expect(salaryPer().value).toBe("annual");
    expect(screen.getByLabelText("Salary from (EUR)")).toBe(salaryFrom());

    await user.click(screen.getByRole("button", { name: /add application/i }));
    await waitFor(() => {
      expect(createApplicationMock).toHaveBeenCalledWith(
        expect.objectContaining({
          company_id: ACME.id,
          posted_salary_min: "120000",
          posted_salary_max: "150000",
          posted_salary_currency: "EUR",
          posted_salary_period: "annual",
        }),
      );
    });
  });

  it("sends the salary as changed on the review step", async () => {
    const user = await pasteAndReview({ ...PARSE, salary_min: 120000, salary_max: 150000, salary_period: "annual" });

    await user.clear(salaryTo());
    await user.type(salaryTo(), "160000.50");
    await user.selectOptions(salaryPer(), "monthly");
    await user.click(screen.getByRole("button", { name: /add application/i }));

    await waitFor(() => {
      expect(createApplicationMock).toHaveBeenCalledWith(
        expect.objectContaining({ posted_salary_min: "120000", posted_salary_max: "160000.50", posted_salary_period: "monthly" }),
      );
    });
  });

  it("leaves the salary blank for a posting without one and sends null, not 0", async () => {
    const user = await pasteAndReview(PARSE);

    expect(salaryFrom().value).toBe("");
    expect(salaryTo().value).toBe("");
    expect(salaryPer().value).toBe("");

    await user.click(screen.getByRole("button", { name: /add application/i }));
    await waitFor(() => {
      expect(createApplicationMock).toHaveBeenCalledWith(
        expect.objectContaining({ posted_salary_min: null, posted_salary_max: null, posted_salary_period: null }),
      );
    });
  });

  it("refuses a top below the bottom and sends nothing", async () => {
    const user = await pasteAndReview({ ...PARSE, salary_min: 150000, salary_max: 120000 });

    await user.click(screen.getByRole("button", { name: /add application/i }));

    expect(await screen.findByText(PROBLEMS.salaryMinAboveMax)).toBeInTheDocument();
    expect(createApplicationMock).not.toHaveBeenCalled();
  });
});
