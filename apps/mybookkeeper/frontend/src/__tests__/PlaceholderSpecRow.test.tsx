import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import PlaceholderSpecRow from "@/app/features/leases/PlaceholderSpecRow";
import type { LeaseTemplatePlaceholder } from "@mybookkeeper/api-client/types/lease/lease-template-placeholder";

vi.mock("@mybookkeeper/api-client/store/leaseTemplatesApi", () => ({
  useUpdateLeasePlaceholderMutation: () => [vi.fn(), { isLoading: false }],
}));

const PLACEHOLDER: LeaseTemplatePlaceholder = {
  id: "ph-1",
  template_id: "t-1",
  key: "RENT",
  display_label: "Monthly rent",
  input_type: "text",
  required: true,
  default_source: null,
  computed_expr: null,
  display_order: 0,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("PlaceholderSpecRow", () => {
  it("names every control with the placeholder it edits", () => {
    render(
      <table>
        <tbody>
          <PlaceholderSpecRow templateId="t-1" placeholder={PLACEHOLDER} />
        </tbody>
      </table>,
    );
    expect(screen.getByRole("textbox", { name: "Display label for [RENT]" })).toHaveValue("Monthly rent");
    expect(screen.getByRole("combobox", { name: "Input type for [RENT]" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Required" })).toBeChecked();
    expect(screen.getByRole("textbox", { name: "Default source for [RENT]" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Computed expression for [RENT]" })).toBeInTheDocument();
  });
});
