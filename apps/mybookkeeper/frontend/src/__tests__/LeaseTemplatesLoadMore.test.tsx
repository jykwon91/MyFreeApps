/**
 * Against the real RTK Query hooks: the Lease Templates page and the new-lease template picker
 * reach templates past the first page with Load more, keep their rows when a Load more fails,
 * and the picker keeps a template picked on page 1 selected after page 2 loads.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LeaseTemplates from "@/app/pages/LeaseTemplates";
import MultiTemplatePicker from "@/app/features/leases/MultiTemplatePicker";
import type { LeaseTemplateSummary } from "@mybookkeeper/api-client/types/lease/lease-template-summary";
import { restoreApi, stubApi } from "@/test/api-stub";
import { renderWithStore } from "@/test/render-with-store";

vi.mock("@/shared/hooks/useOrgRole", () => ({ useCanWrite: vi.fn(() => true) }));

function template(n: number): LeaseTemplateSummary {
  return {
    id: `tpl-${n}`,
    user_id: "u1",
    organization_id: "org-1",
    name: `Template ${n}`,
    description: null,
    version: 1,
    file_count: 1,
    placeholder_count: 2,
    created_at: "2026-05-01T00:00:00Z",
    updated_at: "2026-05-01T00:00:00Z",
  };
}

const PAGE_ONE = { items: [template(1), template(2)], total: 3, has_more: true };
const PAGE_TWO = { items: [template(3)], total: 3, has_more: false };
const LOAD_MORE_ERROR = /couldn't load more templates/i;

let cleanup: () => void = () => undefined;

afterEach(() => {
  cleanup();
  restoreApi();
});

/** Serves page 1, then page 2 (failing the first `failuresOnPageTwo` times). Returns the offsets asked for. */
function serveTemplates(failuresOnPageTwo = 0): number[] {
  const offsets: number[] = [];
  let failures = failuresOnPageTwo;
  stubApi((path, params) => {
    if (path !== "/lease-templates") return {};
    const offset = Number(params.offset ?? 0);
    offsets.push(offset);
    if (offset === 0) return PAGE_ONE;
    if (failures > 0) {
      failures -= 1;
      throw new Error("server down");
    }
    return PAGE_TWO;
  });
  return offsets;
}

function PickerHarness() {
  const [selected, setSelected] = useState<string[]>([]);
  return (
    <>
      <MultiTemplatePicker
        selectedIds={selected}
        onToggle={(t) => setSelected((prev) => (prev.includes(t.id) ? prev.filter((id) => id !== t.id) : [...prev, t.id]))}
      />
      <p data-testid="picked">{selected.join(",")}</p>
    </>
  );
}

describe("Lease Templates page paging", () => {
  it("loads the next page of templates when Load more is pressed", async () => {
    const offsets = serveTemplates();
    cleanup = renderWithStore(<LeaseTemplates />, "/lease-templates");

    expect(await screen.findByText("Template 2")).toBeInTheDocument();
    expect(screen.queryByText("Template 3")).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId("load-more-button"));

    expect(await screen.findByText("Template 3")).toBeInTheDocument();
    expect(screen.getByText("Template 1")).toBeInTheDocument();
    expect(screen.queryByTestId("load-more-button")).not.toBeInTheDocument();
    expect(offsets).toContain(25);
  });

  it("keeps the templates when Load more fails and loads the page on Retry", async () => {
    serveTemplates(1);
    cleanup = renderWithStore(<LeaseTemplates />, "/lease-templates");
    await screen.findByText("Template 2");

    await userEvent.click(screen.getByTestId("load-more-button"));

    expect(await screen.findByText(LOAD_MORE_ERROR)).toBeInTheDocument();
    expect(screen.queryByText(/couldn't load your templates/i)).not.toBeInTheDocument();
    expect(screen.getByText("Template 1")).toBeInTheDocument();
    expect(screen.getByText("Template 2")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("Template 3")).toBeInTheDocument();
    expect(screen.queryByText(LOAD_MORE_ERROR)).not.toBeInTheDocument();
  });
});

describe("MultiTemplatePicker paging", () => {
  it("lets a template from page 2 be selected", async () => {
    serveTemplates();
    cleanup = renderWithStore(<PickerHarness />, "/leases/new");
    await screen.findByTestId("multi-template-checkbox-tpl-2");

    await userEvent.click(screen.getByTestId("load-more-button"));
    await userEvent.click(await screen.findByTestId("multi-template-checkbox-tpl-3"));

    expect(screen.getByTestId("picked")).toHaveTextContent("tpl-3");
    expect(screen.getByTestId("multi-template-order-tpl-3")).toHaveTextContent("Selected #1");
  });

  it("keeps a template picked on page 1 selected after page 2 loads", async () => {
    serveTemplates();
    cleanup = renderWithStore(<PickerHarness />, "/leases/new");
    await userEvent.click(await screen.findByTestId("multi-template-checkbox-tpl-1"));

    await userEvent.click(screen.getByTestId("load-more-button"));
    await userEvent.click(await screen.findByTestId("multi-template-checkbox-tpl-3"));

    const list = screen.getByTestId("multi-template-picker-list");
    expect(within(list).getByTestId("multi-template-checkbox-tpl-1")).toBeChecked();
    expect(within(list).getByTestId("multi-template-order-tpl-1")).toHaveTextContent("Selected #1");
    expect(within(list).getByTestId("multi-template-order-tpl-3")).toHaveTextContent("Selected #2");
  });

  it("keeps the rows and the selection when Load more fails, and loads the page on Retry", async () => {
    serveTemplates(1);
    cleanup = renderWithStore(<PickerHarness />, "/leases/new");
    await userEvent.click(await screen.findByTestId("multi-template-checkbox-tpl-1"));

    await userEvent.click(screen.getByTestId("load-more-button"));

    expect(await screen.findByText(LOAD_MORE_ERROR)).toBeInTheDocument();
    expect(screen.queryByText(/couldn't load your templates/i)).not.toBeInTheDocument();
    expect(screen.getByTestId("multi-template-checkbox-tpl-1")).toBeChecked();

    await userEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByTestId("multi-template-checkbox-tpl-3")).toBeInTheDocument();
    expect(screen.getByTestId("multi-template-checkbox-tpl-1")).toBeChecked();
  });
});
