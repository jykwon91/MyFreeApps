/**
 * Smoke tests for AddCompanyDialog.
 *
 * AddCompanyDialog is a thin wrapper around CompanyForm. These tests confirm:
 * - The dialog renders CompanyForm when open
 * - Successful submit calls createCompany mutation, shows success toast, closes
 * - Error from mutation shows error toast and keeps dialog open
 * - Cancel closes without calling the mutation
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AddCompanyDialog from "../AddCompanyDialog";

// ---- mocks ----

vi.mock("@/lib/companiesApi", () => ({
  useCreateCompanyMutation: vi.fn(),
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

import { useCreateCompanyMutation } from "@/lib/companiesApi";
import { showSuccess, showError } from "@platform/ui";

const mockUseCreateCompanyMutation = vi.mocked(useCreateCompanyMutation);
const mockShowSuccess = vi.mocked(showSuccess);
const mockShowError = vi.mocked(showError);

describe("AddCompanyDialog", () => {
  const mockOnOpenChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
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

  it("shows showError and keeps dialog open when mutation throws", async () => {
    const user = userEvent.setup();
    const mockCreate = vi.fn().mockReturnValue({
      unwrap: () => Promise.reject(new Error("Duplicate domain")),
    });
    const stubMutation = [mockCreate, { isLoading: false }] as unknown as ReturnType<typeof useCreateCompanyMutation>;
    mockUseCreateCompanyMutation.mockReturnValue(stubMutation);

    renderDialog(true);

    await user.type(screen.getByLabelText(/name/i), "Acme Corp");
    await user.click(screen.getByRole("button", { name: /add company/i }));

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalled();
      expect(mockOnOpenChange).not.toHaveBeenCalled();
    });
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
