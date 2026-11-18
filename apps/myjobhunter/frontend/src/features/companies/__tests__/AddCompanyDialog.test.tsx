/**
 * Smoke tests for AddCompanyDialog.
 *
 * AddCompanyDialog is a thin wrapper around CompanyForm. These tests confirm:
 * - The dialog renders CompanyForm when open
 * - Successful submit calls createCompany mutation, shows success toast, closes
 * - Error from mutation shows error toast and keeps dialog open
 * - A lost answer reads the list again: a new company with the name counts as added
 * - Cancel closes without calling the mutation
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AddCompanyDialog from "../AddCompanyDialog";
import { COMPANY_FORM_PROBLEMS } from "@myjobhunter/api-client/constants/companyFormProblems";

// ---- mocks ----

vi.mock("@myjobhunter/api-client/store/companiesApi", () => ({
  useCreateCompanyMutation: vi.fn(),
  useListCompaniesQuery: vi.fn(),
}));

vi.mock("@radix-ui/react-dialog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@radix-ui/react-dialog")>();
  return {
    ...actual,
    Portal: ({ children }: { children: React.ReactNode }) => children,
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
      ...rest
    }: {
      children: React.ReactNode;
      isLoading?: boolean;
      loadingText?: string;
      type?: "button" | "submit" | "reset";
    } & Record<string, unknown>) => (
      <button type={type ?? "button"} disabled={isLoading} {...rest}>
        {isLoading ? loadingText : children}
      </button>
    ),
  };
});

import { useCreateCompanyMutation, useListCompaniesQuery } from "@myjobhunter/api-client/store/companiesApi";
import { showSuccess, showError } from "@platform/ui";

const mockUseCreateCompanyMutation = vi.mocked(useCreateCompanyMutation);
const mockUseListCompaniesQuery = vi.mocked(useListCompaniesQuery);
const ACME = { id: "c1", name: "Acme Corp" };
const listOf = (...items: { id: string; name: string }[]) => ({ items, total: items.length });

/** The companies list as the dialog holds it, and what reading it again answers. */
function serveList(held: ReturnType<typeof listOf>, reread: () => Promise<ReturnType<typeof listOf>>) {
  const refetch = vi.fn(() => ({ unwrap: reread }));
  mockUseListCompaniesQuery.mockReturnValue({ currentData: held, refetch } as unknown as ReturnType<typeof useListCompaniesQuery>);
  return refetch;
}
const mockShowSuccess = vi.mocked(showSuccess);
const mockShowError = vi.mocked(showError);

describe("AddCompanyDialog", () => {
  const mockOnOpenChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    serveList(listOf(ACME), () => Promise.resolve(listOf(ACME)));
  });

  function renderDialog(open = true) {
    return render(
      <AddCompanyDialog open={open} onOpenChange={mockOnOpenChange} />,
    );
  }

  it("renders the company form when open", () => {
    const stubMutation = [vi.fn(), { isLoading: false }] as unknown as ReturnType<typeof useCreateCompanyMutation>;
    mockUseCreateCompanyMutation.mockReturnValue(stubMutation);

    renderDialog(true);

    // CompanyForm fields should be visible
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText("acme.com")).toBeInTheDocument();
  });

  it("calls createCompany mutation and fires showSuccess on successful submit", async () => {
    const user = userEvent.setup();
    const mockCreate = vi.fn().mockReturnValue({
      unwrap: () => Promise.resolve({ id: "c1", name: "Acme Corp" }),
    });
    const stubMutation = [mockCreate, { isLoading: false }] as unknown as ReturnType<typeof useCreateCompanyMutation>;
    mockUseCreateCompanyMutation.mockReturnValue(stubMutation);

    renderDialog(true);

    await user.type(screen.getByLabelText(/name/i), "Acme Corp");
    await user.click(screen.getByRole("button", { name: /add company/i }));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith({
        name: "Acme Corp",
        primary_domain: null,
        industry: null,
        hq_location: null,
      });
      expect(mockShowSuccess).toHaveBeenCalledWith('Company "Acme Corp" added');
      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("shows showError and keeps dialog open when the server refuses it", async () => {
    const user = userEvent.setup();
    const mockCreate = vi.fn().mockReturnValue({
      unwrap: () => Promise.reject({ status: 500, data: { detail: "Database unavailable" } }),
    });
    const stubMutation = [mockCreate, { isLoading: false }] as unknown as ReturnType<typeof useCreateCompanyMutation>;
    mockUseCreateCompanyMutation.mockReturnValue(stubMutation);

    renderDialog(true);

    await user.type(screen.getByLabelText(/name/i), "Acme Corp");
    await user.click(screen.getByRole("button", { name: /add company/i }));

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalledWith("Couldn't create company: Database unavailable");
      expect(mockOnOpenChange).not.toHaveBeenCalled();
    });
  });

  describe("when the answer is lost", () => {
    const NO_ANSWER = { status: undefined, data: "Network Error" };

    async function addHooli(answer: unknown, onCreated = vi.fn()) {
      const user = userEvent.setup();
      const mockCreate = vi.fn().mockReturnValue({ unwrap: () => Promise.reject(answer) });
      mockUseCreateCompanyMutation.mockReturnValue([mockCreate, { isLoading: false }] as unknown as ReturnType<typeof useCreateCompanyMutation>);
      render(<AddCompanyDialog open onOpenChange={mockOnOpenChange} onCreated={onCreated} />);
      await user.type(screen.getByLabelText(/name/i), "Hooli");
      await user.click(screen.getByRole("button", { name: /add company/i }));
      return mockCreate;
    }

    it.each([
      ["no answer", NO_ANSWER],
      ["a proxy error", { status: 504, data: "<html>Gateway Timeout</html>" }],
    ])("says it was added, rather than inviting a second, when the list has a new one with the name after %s", async (_case, answer) => {
      // One already tracked under the name doesn't count; the new one does.
      const OLD = { id: "c-old", name: "Hooli" };
      const NEW = { id: "c-new", name: "Hooli" };
      serveList(listOf(ACME, OLD), () => Promise.resolve(listOf(ACME, OLD, NEW)));
      const onCreated = vi.fn();
      const mockCreate = await addHooli(answer, onCreated);

      await waitFor(() => expect(mockShowSuccess).toHaveBeenCalledWith('Company "Hooli" added'));
      expect(onCreated).toHaveBeenCalledWith(NEW);
      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
      expect(mockShowError).not.toHaveBeenCalled();
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it("says it couldn't, so it can be tried again, when the list shows it wasn't added", async () => {
      serveList(listOf(ACME, { id: "c-old", name: "Hooli" }), () => Promise.resolve(listOf(ACME, { id: "c-old", name: "Hooli" })));
      await addHooli(NO_ANSWER);

      await waitFor(() => expect(mockShowError).toHaveBeenCalledWith(expect.stringMatching(/^Couldn't create company: /)));
      expect(mockShowSuccess).not.toHaveBeenCalled();
      expect(mockOnOpenChange).not.toHaveBeenCalled();
    });

    it("says it isn't sure, rather than inviting a second, when the list can't be read", async () => {
      serveList(listOf(ACME), () => Promise.reject(NO_ANSWER));
      await addHooli(NO_ANSWER);

      await waitFor(() =>
        expect(mockShowError).toHaveBeenCalledWith(
          "I lost the connection, so I'm not sure that saved. Check your companies before trying again, so you don't end up with two.",
        ),
      );
      expect(mockShowSuccess).not.toHaveBeenCalled();
      expect(mockOnOpenChange).not.toHaveBeenCalled();
    });

    it("says nothing when signing out called it off", async () => {
      await addHooli({ name: "AbortError", message: "Aborted" });

      await waitFor(() => expect(screen.getByRole("button", { name: /add company/i })).toBeEnabled());
      expect(mockShowError).not.toHaveBeenCalled();
      expect(mockShowSuccess).not.toHaveBeenCalled();
    });
  });

  it("says on the domain field, not in a toast, when another company already has that domain", async () => {
    const user = userEvent.setup();
    const mockCreate = vi.fn().mockReturnValue({
      unwrap: () => Promise.reject({ status: 409, data: { detail: "A company with primary_domain='acme.com' already exists." } }),
    });
    const stubMutation = [mockCreate, { isLoading: false }] as unknown as ReturnType<typeof useCreateCompanyMutation>;
    mockUseCreateCompanyMutation.mockReturnValue(stubMutation);

    renderDialog(true);

    await user.type(screen.getByLabelText(/name/i), "Acme Again");
    await user.type(screen.getByPlaceholderText("acme.com"), "acme.com");
    await user.click(screen.getByRole("button", { name: /add company/i }));

    expect(await screen.findByText(COMPANY_FORM_PROBLEMS.duplicateDomain)).toBeInTheDocument();
    expect(screen.queryByText(/must be unique across your companies/i)).not.toBeInTheDocument();
    expect(mockShowError).not.toHaveBeenCalled();
    expect(mockShowSuccess).not.toHaveBeenCalled();
    expect(mockOnOpenChange).not.toHaveBeenCalled();

    // Changing the domain clears it.
    await user.type(screen.getByPlaceholderText("acme.com"), "x");
    await waitFor(() => expect(screen.queryByText(COMPANY_FORM_PROBLEMS.duplicateDomain)).not.toBeInTheDocument());
  });

  it("closes the dialog on cancel without calling the mutation", async () => {
    const user = userEvent.setup();
    const mockCreate = vi.fn();
    const stubMutation = [mockCreate, { isLoading: false }] as unknown as ReturnType<typeof useCreateCompanyMutation>;
    mockUseCreateCompanyMutation.mockReturnValue(stubMutation);

    renderDialog(true);

    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });
});
