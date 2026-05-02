/**
 * Unit tests for CompanyForm.
 *
 * CompanyForm is a pure form component — no Dialog wrapper, no Redux hooks.
 * These tests cover: validation, submit payload, cancel, initialValues.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CompanyForm from "../CompanyForm";
import type { CompanyCreateRequest } from "@/types/company-create-request";

vi.mock("@platform/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@platform/ui")>();
  return {
    ...actual,
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

describe("CompanyForm", () => {
  const mockOnSubmit = vi.fn();
  const mockOnCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderForm(props: Partial<Parameters<typeof CompanyForm>[0]> = {}) {
    return render(
      <CompanyForm
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
        {...props}
      />,
    );
  }

  describe("rendering", () => {
    it("renders all four fields", () => {
      renderForm();
      expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText("acme.com")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("e.g. SaaS")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("e.g. SF, NYC")).toBeInTheDocument();
    });

    it("renders with a custom submitLabel", () => {
      renderForm({ submitLabel: "Create company" });
      expect(screen.getByRole("button", { name: "Create company" })).toBeInTheDocument();
    });

    it("shows loadingText when submitting=true", () => {
      renderForm({ submitting: true, submitLabel: "Add company" });
      expect(screen.getByRole("button", { name: "Saving..." })).toBeInTheDocument();
    });

    it("renders the cancel button", () => {
      renderForm();
      expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
    });
  });

  describe("validation", () => {
    it("shows an error when name is empty and form is submitted", async () => {
      const user = userEvent.setup();
      renderForm();

      await user.click(screen.getByRole("button", { name: /add company/i }));

      await waitFor(() => {
        expect(screen.getByText("Name is required")).toBeInTheDocument();
      });

      expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it("does not show an error when name is provided", async () => {
      const user = userEvent.setup();
      mockOnSubmit.mockResolvedValue(undefined);
      renderForm();

      await user.type(screen.getByLabelText(/name/i), "Acme Corp");
      await user.click(screen.getByRole("button", { name: /add company/i }));

      await waitFor(() => {
        expect(screen.queryByText("Name is required")).not.toBeInTheDocument();
      });
    });
  });

  describe("submission", () => {
    it("calls onSubmit with trimmed values and null for empty optional fields", async () => {
      const user = userEvent.setup();
      mockOnSubmit.mockResolvedValue(undefined);
      renderForm();

      await user.type(screen.getByLabelText(/name/i), "  Acme Corp  ");
      await user.click(screen.getByRole("button", { name: /add company/i }));

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith<[CompanyCreateRequest]>({
          name: "Acme Corp",
          primary_domain: null,
          industry: null,
          hq_location: null,
        });
      });
    });

    it("calls onSubmit with all fields populated", async () => {
      const user = userEvent.setup();
      mockOnSubmit.mockResolvedValue(undefined);
      renderForm();

      await user.type(screen.getByLabelText(/name/i), "Acme Corp");
      await user.type(screen.getByPlaceholderText("acme.com"), "acme.com");
      await user.type(screen.getByPlaceholderText("e.g. SaaS"), "SaaS");
      await user.type(screen.getByPlaceholderText("e.g. SF, NYC"), "SF");
      await user.click(screen.getByRole("button", { name: /add company/i }));

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith<[CompanyCreateRequest]>({
          name: "Acme Corp",
          primary_domain: "acme.com",
          industry: "SaaS",
          hq_location: "SF",
        });
      });
    });
  });

  describe("cancel", () => {
    it("calls onCancel when the Cancel button is clicked", async () => {
      const user = userEvent.setup();
      renderForm();

      await user.click(screen.getByRole("button", { name: /cancel/i }));

      expect(mockOnCancel).toHaveBeenCalledTimes(1);
      expect(mockOnSubmit).not.toHaveBeenCalled();
    });
  });

  describe("initialValues", () => {
    it("pre-fills the name field from initialValues", () => {
      renderForm({ initialValues: { name: "Pre-filled Corp" } });
      expect(screen.getByDisplayValue("Pre-filled Corp")).toBeInTheDocument();
    });

    it("pre-fills all fields from initialValues", () => {
      renderForm({
        initialValues: {
          name: "Prefill Corp",
          primary_domain: "prefill.io",
          industry: "FinTech",
          hq_location: "NYC",
        },
      });

      expect(screen.getByDisplayValue("Prefill Corp")).toBeInTheDocument();
      expect(screen.getByDisplayValue("prefill.io")).toBeInTheDocument();
      expect(screen.getByDisplayValue("FinTech")).toBeInTheDocument();
      expect(screen.getByDisplayValue("NYC")).toBeInTheDocument();
    });
  });
});
