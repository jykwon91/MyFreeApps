import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import PlaceholderInput from "@/app/features/leases/PlaceholderInput";
import type { LeaseTemplatePlaceholder } from "@mybookkeeper/api-client/types/lease/lease-template-placeholder";

const PLACEHOLDER: LeaseTemplatePlaceholder = {
  id: "ph-1",
  template_id: "t-1",
  key: "TENANT NAME",
  display_label: "Tenant name",
  input_type: "text",
  required: true,
  default_source: null,
  computed_expr: null,
  display_order: 0,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("PlaceholderInput", () => {
  it("ties the visible label to the field", () => {
    render(<PlaceholderInput placeholder={PLACEHOLDER} value="" provenance={null} onChange={vi.fn()} />);
    expect(screen.getByRole("textbox", { name: /Tenant name/ })).toBeInTheDocument();
  });

  it("keeps each field's label separate when several are on the page", () => {
    render(
      <>
        <PlaceholderInput placeholder={PLACEHOLDER} value="" provenance={null} onChange={vi.fn()} />
        <PlaceholderInput
          placeholder={{ ...PLACEHOLDER, id: "ph-2", key: "LANDLORD", display_label: "Landlord" }}
          value=""
          provenance={null}
          onChange={vi.fn()}
        />
      </>,
    );
    expect(screen.getByRole("textbox", { name: /Tenant name/ })).not.toBe(screen.getByRole("textbox", { name: /Landlord/ }));
  });
});
