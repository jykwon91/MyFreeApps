import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import CompletenessChecklist from "@/app/features/tax/CompletenessChecklist";
import type { ChecklistItem } from "@/shared/types/tax/source-document";

const mockChecklist: ChecklistItem[] = [
  {
    expected_type: "1099_k",
    expected_from: "Airbnb",
    reason: "Reservations found on Airbnb platform",
    status: "received",
    document_id: "doc-2",
  },
  {
    expected_type: "1098",
    expected_from: null,
    reason: "Mortgage interest transactions exist",
    status: "missing",
    document_id: null,
  },
];

function renderComponent(items: ChecklistItem[] = mockChecklist) {
  return render(
    <MemoryRouter>
      <CompletenessChecklist items={items} />
    </MemoryRouter>,
  );
}

describe("CompletenessChecklist", () => {
  it("renders nothing when items list is empty", () => {
    const { container } = renderComponent([]);
    expect(container.innerHTML).toBe("");
  });

  it("renders document checklist header with counts", () => {
    renderComponent();
    expect(screen.getByText("Document Checklist")).toBeInTheDocument();
    expect(screen.getByText("1 received, 1 missing")).toBeInTheDocument();
  });

  it("renders received badge for received items", () => {
    renderComponent();
    expect(screen.getByText("Received")).toBeInTheDocument();
  });

  it("renders Upload link for missing items", () => {
    renderComponent();
    const uploadLinks = screen.getAllByText("Upload");
    expect(uploadLinks.length).toBeGreaterThanOrEqual(1);
  });

  it("renders checklist reasons", () => {
    renderComponent();
    expect(screen.getByText("Reservations found on Airbnb platform")).toBeInTheDocument();
    expect(screen.getByText("Mortgage interest transactions exist")).toBeInTheDocument();
  });

  it("renders expected_from when available", () => {
    renderComponent();
    expect(screen.getByText("Airbnb")).toBeInTheDocument();
  });

  it("renders form type badges", () => {
    renderComponent();
    expect(screen.getByText("1099-K")).toBeInTheDocument();
    expect(screen.getByText("1098")).toBeInTheDocument();
  });
});
