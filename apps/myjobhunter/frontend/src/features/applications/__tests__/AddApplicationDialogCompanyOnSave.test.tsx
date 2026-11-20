/**
 * A company the posting names that isn't tracked yet is only added when the
 * application is saved: cancelling the dialog after the read adds nothing (it
 * used to be added during the read, leaving a company with no application).
 * When the add is refused because another company already has its domain
 * (409), the application is saved under that company instead.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { showError, showSuccess } from "@platform/ui";
import type { Company } from "@myjobhunter/api-client/types/company";
import type { JdUrlExtractResponse } from "@myjobhunter/api-client/types/application/jd-url-extract-response";
import AddApplicationDialog from "../AddApplicationDialog";

function company(id: string, name: string, primary_domain: string | null): Company {
  return {
    id,
    user_id: "u1",
    name,
    primary_domain,
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
}

const EXTRACT: JdUrlExtractResponse = {
  title: "Staff Engineer",
  company: "Linear",
  company_website: "https://linear.app/",
  company_logo_url: null,
  location: null,
  description_html: null,
  requirements_text: null,
  summary: null,
  source_url: "https://jobs.example.com/linear",
};

const DOMAIN_TAKEN = { status: 409, data: { detail: "A company with primary_domain='linear.app' already exists." } };

const lists = { current: [] as Company[][] };
const loadList = vi.fn();
const createCompanyMock = vi.fn();
const researchMock = vi.fn();
const createApplicationMock = vi.fn();
const extractMock = vi.fn();

vi.mock("@myjobhunter/api-client/store/companiesApi", () => ({
  useListCompaniesQuery: () => ({ data: { items: [], total: 0 }, isLoading: false, isError: false }),
  useLazyListCompaniesQuery: () => [loadList],
  useCreateCompanyMutation: () => [createCompanyMock, { isLoading: false }],
  useTriggerCompanyResearchMutation: () => [researchMock, { isLoading: false }],
}));

vi.mock("@myjobhunter/api-client/store/applicationsApi", () => ({
  useCreateApplicationMutation: () => [createApplicationMock, { isLoading: false }],
  useParseJobDescriptionMutation: () => [vi.fn(), { isLoading: false }],
  useExtractJdFromUrlMutation: () => [extractMock, { isLoading: false }],
}));

vi.mock("@radix-ui/react-dialog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@radix-ui/react-dialog")>();
  return { ...actual, Portal: ({ children }: { children: React.ReactNode }) => children };
});

vi.mock("@platform/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@platform/ui")>();
  return { ...actual, showSuccess: vi.fn(), showError: vi.fn() };
});

/** Each GET /companies answers with the next list given, the last one again after that. */
function serveLists(...next: Company[][]) {
  lists.current = next;
  let call = 0;
  loadList.mockImplementation(() => {
    const items = lists.current[Math.min(call++, lists.current.length - 1)];
    return { unwrap: () => Promise.resolve({ items, total: items.length }) };
  });
}

async function readLink(onOpenChange = vi.fn()) {
  const user = userEvent.setup();
  render(<AddApplicationDialog open onOpenChange={onOpenChange} />);
  await user.type(screen.getByLabelText(/job posting url/i), EXTRACT.source_url);
  await user.click(screen.getByRole("button", { name: /auto-fill/i }));
  await screen.findByText(/review and adjust before saving/i);
  return user;
}

describe("AddApplicationDialog — the company is added on Save", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    extractMock.mockReturnValue({ unwrap: () => Promise.resolve(EXTRACT), abort: vi.fn() });
    researchMock.mockReturnValue({ unwrap: () => Promise.resolve(undefined) });
    createApplicationMock.mockReturnValue({ unwrap: () => Promise.resolve({ id: "app-1" }) });
    createCompanyMock.mockReturnValue({ unwrap: () => Promise.resolve(company("co-linear", "Linear", "linear.app")) });
  });

  it("adds no company when the dialog is cancelled after the read", async () => {
    serveLists([]);
    const onOpenChange = vi.fn();
    const user = await readLink(onOpenChange);

    expect(screen.getByText(/added when you save/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(createCompanyMock).not.toHaveBeenCalled();
    expect(researchMock).not.toHaveBeenCalled();
    expect(createApplicationMock).not.toHaveBeenCalled();
  });

  it("adds the company with the posting's domain on Save, researches it, and saves under it", async () => {
    serveLists([]);
    const user = await readLink();

    await user.click(screen.getByRole("button", { name: /add application/i }));

    await waitFor(() =>
      expect(createApplicationMock).toHaveBeenCalledWith(expect.objectContaining({ company_id: "co-linear" })),
    );
    expect(createCompanyMock).toHaveBeenCalledWith({ name: "Linear", primary_domain: "linear.app" });
    expect(researchMock).toHaveBeenCalledWith("co-linear");
  });

  it("saves under the company that already has the domain when the add is refused for it", async () => {
    // Added in another tab under another name after the read; only the refused add's refetch sees it.
    serveLists([], [], [company("co-linear-inc", "Linear Inc", "linear.app")]);
    createCompanyMock.mockReturnValue({ unwrap: () => Promise.reject(DOMAIN_TAKEN) });
    const user = await readLink();

    await user.click(screen.getByRole("button", { name: /add application/i }));

    await waitFor(() =>
      expect(createApplicationMock).toHaveBeenCalledWith(expect.objectContaining({ company_id: "co-linear-inc" })),
    );
    expect(createCompanyMock).toHaveBeenCalledTimes(1);
    expect(researchMock).not.toHaveBeenCalled();
    expect(showError).not.toHaveBeenCalled();
    expect(showSuccess).toHaveBeenCalled();
  });
});
