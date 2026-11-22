/**
 * A pasted description is kept as the application's job description only once it has been read.
 * After a failed read, switching to the manual path and saving must not send that old text.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AddApplicationDialog from "../AddApplicationDialog";

const parseMock = vi.fn();
const createApplicationMock = vi.fn();
const createCompanyMock = vi.fn();
const researchMock = vi.fn();

vi.mock("@myjobhunter/api-client/store/companiesApi", () => ({
  useListCompaniesQuery: () => ({ data: { items: [], total: 0 }, isLoading: false, isError: false }),
  useLazyListCompaniesQuery: () => [vi.fn(() => ({ unwrap: () => Promise.resolve({ items: [], total: 0 }) }))],
  useCreateCompanyMutation: () => [createCompanyMock, { isLoading: false }],
}));

vi.mock("@myjobhunter/api-client/hooks/useStartCompanyResearch", () => ({ useStartCompanyResearch: () => researchMock }));

vi.mock("@myjobhunter/api-client/store/applicationsApi", () => ({
  useCreateApplicationMutation: () => [createApplicationMock, { isLoading: false }],
  useParseJobDescriptionMutation: () => [parseMock, { isLoading: false }],
  useExtractJdFromUrlMutation: () => [vi.fn(), { isLoading: false }],
}));

vi.mock("@radix-ui/react-dialog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@radix-ui/react-dialog")>();
  return { ...actual, Portal: ({ children }: { children: React.ReactNode }) => children };
});

vi.mock("@platform/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@platform/ui")>();
  return { ...actual, showSuccess: vi.fn(), showError: vi.fn() };
});

describe("AddApplicationDialog — a failed read of pasted text", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    parseMock.mockReturnValue({ unwrap: () => Promise.reject(new Error("read failed")), abort: vi.fn() });
    researchMock.mockResolvedValue(undefined);
    createApplicationMock.mockReturnValue({ unwrap: () => Promise.resolve({ id: "app-1" }) });
    createCompanyMock.mockReturnValue({ unwrap: () => Promise.resolve({ id: "co-acme", name: "Acme Corp" }) });
  });

  it("sends no job description when the application is then saved by hand", async () => {
    const user = userEvent.setup();
    render(<AddApplicationDialog open onOpenChange={vi.fn()} />);

    await user.click(screen.getByText(/no url\? paste the description text instead/i));
    await user.type(screen.getByLabelText(/job description text/i), "Staff Engineer at Acme");
    await user.click(screen.getByRole("button", { name: /parse with ai/i }));
    await waitFor(() => expect(parseMock).toHaveBeenCalledTimes(1));

    await user.click(await screen.findByText(/adding manually\? type a company name/i));
    await user.type(screen.getByLabelText(/company name/i), "Acme Corp");
    await user.keyboard("{Enter}");
    await screen.findByText(/review and adjust before saving/i);
    await user.type(screen.getByPlaceholderText(/senior backend engineer/i), "Engineer");
    await user.click(screen.getByRole("button", { name: /add application/i }));

    await waitFor(() => expect(createApplicationMock).toHaveBeenCalledTimes(1));
    expect(createApplicationMock).toHaveBeenCalledWith(expect.objectContaining({ jd_text: null }));
  });
});
