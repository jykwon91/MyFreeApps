/**
 * Unit tests for the Documents page.
 *
 * Tests:
 * - Renders page heading
 * - "Add document" button opens DocumentUploadDialog
 * - DocumentList is rendered
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Documents from "@/pages/Documents";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/features/documents/DocumentList", () => ({
  default: () => <div data-testid="document-list" />,
}));

vi.mock("@/features/documents/DocumentUploadDialog", () => ({
  default: ({ open }: { open: boolean }) =>
    open ? <div data-testid="upload-dialog" /> : null,
}));

// Suppress radix portals in jsdom
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
  };
});

function renderDocuments() {
  return render(
    <MemoryRouter initialEntries={["/documents"]}>
      <Routes>
        <Route path="/documents" element={<Documents />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Documents page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the page heading", () => {
    renderDocuments();
    expect(screen.getByRole("heading", { name: /documents/i })).toBeInTheDocument();
  });

  it("renders the DocumentList", () => {
    renderDocuments();
    expect(screen.getByTestId("document-list")).toBeInTheDocument();
  });

  it("renders the 'Add document' button", () => {
    renderDocuments();
    expect(screen.getByRole("button", { name: /add document/i })).toBeInTheDocument();
  });

  it("opens the upload dialog when 'Add document' is clicked", async () => {
    const user = userEvent.setup();
    renderDocuments();

    expect(screen.queryByTestId("upload-dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /add document/i }));

    expect(screen.getByTestId("upload-dialog")).toBeInTheDocument();
  });
});
