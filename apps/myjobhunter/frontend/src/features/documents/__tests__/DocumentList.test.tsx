/**
 * Unit tests for DocumentList.
 *
 * Tests:
 * - Loading state: renders skeleton rows
 * - Error state: renders error message
 * - Empty state: renders empty-state heading
 * - Loaded state: renders document titles and kind badges
 * - Delete: calls mutation after window.confirm
 * - Kind filter: shows select when hideKindFilter is false, hidden when true
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import DocumentList from "../DocumentList";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/documentsApi", () => ({
  useListDocumentsQuery: vi.fn(),
  useDeleteDocumentMutation: vi.fn(),
  useGetDocumentDownloadUrlQuery: vi.fn(),
  useUpdateDocumentMutation: vi.fn(),
}));

vi.mock("@platform/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@platform/ui")>();
  return {
    ...actual,
    showSuccess: vi.fn(),
    showError: vi.fn(),
    EmptyState: ({ heading }: { heading: string }) => <div>{heading}</div>,
    Skeleton: ({ className }: { className?: string }) => (
      <div data-testid="skeleton" className={className} />
    ),
    Badge: ({ label }: { label: string }) => <span>{label}</span>,
  };
});

vi.mock("@radix-ui/react-dialog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@radix-ui/react-dialog")>();
  return {
    ...actual,
    Portal: ({ children }: { children: React.ReactNode }) => children,
  };
});

// DocumentEditDialog — stub it to avoid pulling in its deps
vi.mock("@/features/documents/DocumentEditDialog", () => ({
  default: () => <div data-testid="edit-dialog" />,
}));

// DocumentKindBadge — stub
vi.mock("@/features/documents/DocumentKindBadge", () => ({
  default: ({ kind }: { kind: string }) => <span data-testid="kind-badge">{kind}</span>,
}));

import {
  useListDocumentsQuery,
  useDeleteDocumentMutation,
  useGetDocumentDownloadUrlQuery,
} from "@/lib/documentsApi";
import { showSuccess } from "@platform/ui";

const mockUseListDocumentsQuery = vi.mocked(useListDocumentsQuery);
const mockUseDeleteDocumentMutation = vi.mocked(useDeleteDocumentMutation);
const mockUseGetDocumentDownloadUrlQuery = vi.mocked(useGetDocumentDownloadUrlQuery);
const mockShowSuccess = vi.mocked(showSuccess);

const stubDeleteMutation = [vi.fn(), { isLoading: false }] as unknown as ReturnType<
  typeof useDeleteDocumentMutation
>;

function makeDoc(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "doc-1",
    user_id: "user-1",
    application_id: null,
    title: "My Cover Letter",
    kind: "cover_letter",
    body: "Body text here",
    filename: null,
    content_type: null,
    size_bytes: null,
    has_file: false,
    deleted_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function renderList(props: { applicationId?: string; hideKindFilter?: boolean } = {}) {
  return render(
    <MemoryRouter>
      <DocumentList {...props} />
    </MemoryRouter>,
  );
}

describe("DocumentList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseDeleteDocumentMutation.mockReturnValue(stubDeleteMutation);
    mockUseGetDocumentDownloadUrlQuery.mockReturnValue({
      data: undefined,
      isFetching: false,
    } as unknown as ReturnType<typeof useGetDocumentDownloadUrlQuery>);
  });

  describe("loading state", () => {
    it("renders skeleton rows while loading", () => {
      mockUseListDocumentsQuery.mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
      } as unknown as ReturnType<typeof useListDocumentsQuery>);

      renderList();

      const skeletons = screen.getAllByTestId("skeleton");
      expect(skeletons.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("error state", () => {
    it("renders an error message when the query fails", () => {
      mockUseListDocumentsQuery.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
      } as unknown as ReturnType<typeof useListDocumentsQuery>);

      renderList();

      expect(screen.getByText(/couldn't load documents/i)).toBeInTheDocument();
    });
  });

  describe("empty state", () => {
    it("renders empty state heading when there are no documents", () => {
      mockUseListDocumentsQuery.mockReturnValue({
        data: { items: [], total: 0 },
        isLoading: false,
        isError: false,
      } as unknown as ReturnType<typeof useListDocumentsQuery>);

      renderList();

      expect(screen.getByText("No documents yet")).toBeInTheDocument();
    });
  });

  describe("loaded state", () => {
    it("renders document titles", () => {
      mockUseListDocumentsQuery.mockReturnValue({
        data: {
          items: [
            makeDoc({ id: "doc-1", title: "Cover Letter Draft" }),
            makeDoc({ id: "doc-2", title: "Tailored Resume" }),
          ],
          total: 2,
        },
        isLoading: false,
        isError: false,
      } as unknown as ReturnType<typeof useListDocumentsQuery>);

      renderList();

      expect(screen.getByText("Cover Letter Draft")).toBeInTheDocument();
      expect(screen.getByText("Tailored Resume")).toBeInTheDocument();
    });

    it("renders kind badges for each document", () => {
      mockUseListDocumentsQuery.mockReturnValue({
        data: {
          items: [makeDoc({ kind: "tailored_resume" })],
          total: 1,
        },
        isLoading: false,
        isError: false,
      } as unknown as ReturnType<typeof useListDocumentsQuery>);

      renderList();

      expect(screen.getByTestId("kind-badge")).toHaveTextContent("tailored_resume");
    });

    it("shows the kind filter select when hideKindFilter is not set", () => {
      mockUseListDocumentsQuery.mockReturnValue({
        data: { items: [], total: 0 },
        isLoading: false,
        isError: false,
      } as unknown as ReturnType<typeof useListDocumentsQuery>);

      renderList();

      expect(screen.getByRole("combobox")).toBeInTheDocument();
    });

    it("hides the kind filter when hideKindFilter is true", () => {
      mockUseListDocumentsQuery.mockReturnValue({
        data: { items: [], total: 0 },
        isLoading: false,
        isError: false,
      } as unknown as ReturnType<typeof useListDocumentsQuery>);

      renderList({ hideKindFilter: true });

      expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    });
  });

  describe("delete", () => {
    it("calls deleteDocument mutation after confirmation", async () => {
      const user = userEvent.setup();
      const mockDelete = vi.fn().mockReturnValue({ unwrap: () => Promise.resolve() });
      mockUseDeleteDocumentMutation.mockReturnValue(
        [mockDelete, { isLoading: false }] as unknown as ReturnType<typeof useDeleteDocumentMutation>,
      );
      // Stub window.confirm to return true
      vi.spyOn(window, "confirm").mockReturnValue(true);

      mockUseListDocumentsQuery.mockReturnValue({
        data: { items: [makeDoc()], total: 1 },
        isLoading: false,
        isError: false,
      } as unknown as ReturnType<typeof useListDocumentsQuery>);

      renderList();

      await user.click(screen.getByTitle("Delete"));

      await waitFor(() => {
        expect(mockDelete).toHaveBeenCalledWith("doc-1");
        expect(mockShowSuccess).toHaveBeenCalledWith("Document deleted");
      });
    });

    it("does not call deleteDocument if user cancels confirmation", async () => {
      const user = userEvent.setup();
      const mockDelete = vi.fn();
      mockUseDeleteDocumentMutation.mockReturnValue(
        [mockDelete, { isLoading: false }] as unknown as ReturnType<typeof useDeleteDocumentMutation>,
      );
      vi.spyOn(window, "confirm").mockReturnValue(false);

      mockUseListDocumentsQuery.mockReturnValue({
        data: { items: [makeDoc()], total: 1 },
        isLoading: false,
        isError: false,
      } as unknown as ReturnType<typeof useListDocumentsQuery>);

      renderList();

      await user.click(screen.getByTitle("Delete"));

      expect(mockDelete).not.toHaveBeenCalled();
    });
  });
});
