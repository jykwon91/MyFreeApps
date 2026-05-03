import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { store } from "@/shared/store";
import PlaceholderSpecEditor from "@/app/features/leases/PlaceholderSpecEditor";
import type { LeaseTemplatePlaceholder } from "@/shared/types/lease/lease-template-placeholder";

vi.mock("@/shared/store/leaseTemplatesApi", async () => {
  const actual = await vi.importActual<
    typeof import("@/shared/store/leaseTemplatesApi")
  >("@/shared/store/leaseTemplatesApi");
  return {
    ...actual,
    useUpdateLeasePlaceholderMutation: () => [vi.fn(), { isLoading: false }],
  };
});

const placeholders: LeaseTemplatePlaceholder[] = [
  {
    id: "ph-1",
    template_id: "tpl-1",
    key: "TENANT FULL NAME",
    display_label: "Tenant full name",
    input_type: "text",
    required: true,
    default_source: "applicant.legal_name",
    computed_expr: null,
    display_order: 0,
    created_at: "2026-05-02T00:00:00Z",
    updated_at: "2026-05-02T00:00:00Z",
  },
  {
    id: "ph-2",
    template_id: "tpl-1",
    key: "NUMBER OF DAYS",
    display_label: "Number of days",
    input_type: "computed",
    required: true,
    default_source: null,
    computed_expr: "(MOVE-OUT DATE - MOVE-IN DATE).days",
    display_order: 1,
    created_at: "2026-05-02T00:00:00Z",
    updated_at: "2026-05-02T00:00:00Z",
  },
];

function renderEditor(rows: LeaseTemplatePlaceholder[]) {
  return render(
    <Provider store={store}>
      <PlaceholderSpecEditor templateId="tpl-1" placeholders={rows} />
    </Provider>,
  );
}

describe("PlaceholderSpecEditor", () => {
  it("renders an empty-state message when no placeholders are present", () => {
    renderEditor([]);
    expect(screen.getByTestId("placeholders-empty")).toBeInTheDocument();
  });

  it("renders one row per placeholder", () => {
    renderEditor(placeholders);
    expect(screen.getByTestId("placeholder-row-TENANT FULL NAME")).toBeInTheDocument();
    expect(screen.getByTestId("placeholder-row-NUMBER OF DAYS")).toBeInTheDocument();
  });

  it("shows the placeholder key in monospace, including the brackets", () => {
    renderEditor(placeholders);
    const row = screen.getByTestId("placeholder-row-TENANT FULL NAME");
    expect(row).toHaveTextContent("[TENANT FULL NAME]");
  });

  it("disables the computed_expr input for non-computed input types", () => {
    renderEditor(placeholders);
    const textRow = screen.getByTestId("placeholder-row-TENANT FULL NAME");
    const computedInputs = textRow.querySelectorAll("input[type='text']");
    // Last text input is the computed_expr cell.
    const computedInput = computedInputs[computedInputs.length - 1] as HTMLInputElement;
    expect(computedInput).toBeDisabled();
  });

  it("enables the computed_expr input for computed placeholders", () => {
    renderEditor(placeholders);
    const computedRow = screen.getByTestId("placeholder-row-NUMBER OF DAYS");
    const inputs = computedRow.querySelectorAll("input[type='text']");
    const computedInput = inputs[inputs.length - 1] as HTMLInputElement;
    expect(computedInput).not.toBeDisabled();
    expect(computedInput.value).toBe("(MOVE-OUT DATE - MOVE-IN DATE).days");
  });
});
