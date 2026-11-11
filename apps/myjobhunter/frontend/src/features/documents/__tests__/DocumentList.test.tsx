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
 * - Download: one popup-safe open per click, none on re-render, error path
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import DocumentList from "../DocumentList";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@myjobhunter/api-client/hooks/useDocumentsPages", () => ({
  useDocumentsPages: vi.fn(),
}));

vi.mock("@myjobhunter/api-client/store/documentsApi", () => ({
  useDeleteDocumentMutation: vi.fn(),
  useLazyGetDocumentDownloadUrlQuery: vi.fn(),
  useUpdateDocumentMutation: vi.fn(),
}));

vi.mock("@platform/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@platform/ui")>();
  return {
    ...actual,
    showSuccess: vi.fn(),
    showError: vi.fn(),
    EmptyState: ({
      heading,
      action,
    }: {
      heading: string;
      action?: { label: string; onClick: () => void };
    }) => (
      <div>
        <h3>{heading}</h3>
        {action ? <button onClick={action.onClick}>{action.label}</button> : null}
      </div>
    ),
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

import type { Document } from "@myjobhunter/api-client/types/document/document";
import { useDocumentsPages } from "@myjobhunter/api-client/hooks/useDocumentsPages";
import type { DocumentsPagesState } from "@myjobhunter/api-client/types/document/documents-pages-state";
import {
  useDeleteDocumentMutation,
  useLazyGetDocumentDownloadUrlQuery,
} from "@myjobhunter/api-client/store/documentsApi";
import { showSuccess, showError } from "@platform/ui";

const mockUseDocumentsPages = vi.mocked(useDocumentsPages);
const mockUseDeleteDocumentMutation = vi.mocked(useDeleteDocumentMutation);
const mockUseLazyDownloadQuery = vi.mocked(useLazyGetDocumentDownloadUrlQuery);
const mockShowError = vi.mocked(showError);
const mockShowSuccess = vi.mocked(showSuccess);

const stubDeleteMutation = [vi.fn(), { isLoading: false }] as unknown as ReturnType<
  typeof useDeleteDocumentMutation
>;

function makeDoc(overrides: Partial<Document> = {}): Document {
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

function pagesState(overrides: Partial<DocumentsPagesState> = {}): DocumentsPagesState {
  return {
    documents: [],
    total: 0,
    isLoading: false,
    hasData: true,
    isFiltering: false,
    loadError: undefined,
    error: undefined,
    hasNextPage: false,
    isFetchingNextPage: false,
    isLoadMoreError: false,
    loadMore: vi.fn(),
    refetch: vi.fn(),
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
    mockUseLazyDownloadQuery.mockReturnValue([
      vi.fn(),
      {},
    ] as unknown as ReturnType<typeof useLazyGetDocumentDownloadUrlQuery>);
  });

  describe("loading state", () => {
    it("renders skeleton rows while loading", () => {
      mockUseDocumentsPages.mockReturnValue(pagesState({ isLoading: true }));

      renderList();

      const skeletons = screen.getAllByTestId("skeleton");
      expect(skeletons.length).toBeGreaterThanOrEqual(3);
    });

    it("mirrors the loaded list: filter bar, then rows shaped like document rows", () => {
      mockUseDocumentsPages.mockReturnValue(pagesState({ isLoading: true }));

      renderList();

      expect(screen.getByTestId("document-filter-skeleton")).toBeInTheDocument();
      expect(screen.getAllByTestId("document-row-skeleton")).toHaveLength(3);
      expect(screen.getByRole("status")).toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveTextContent("Loading documents");
      expect(screen.queryByText(/loading\.\.\./i)).not.toBeInTheDocument();
    });

    it("omits the filter bar placeholder when the filter is hidden", () => {
      mockUseDocumentsPages.mockReturnValue(pagesState({ isLoading: true }));

      renderList({ hideKindFilter: true });

      expect(screen.queryByTestId("document-filter-skeleton")).not.toBeInTheDocument();
      expect(screen.getAllByTestId("document-row-skeleton")).toHaveLength(3);
    });

    it("keeps the real filter bar and shows only rows while a new filter loads", () => {
      mockUseDocumentsPages.mockReturnValue(pagesState({ isFiltering: true }));

      renderList();

      expect(screen.getByRole("combobox")).toBeInTheDocument();
      expect(screen.queryByTestId("document-filter-skeleton")).not.toBeInTheDocument();
      expect(screen.getAllByTestId("document-row-skeleton")).toHaveLength(3);
    });
  });

  describe("error state", () => {
    it("renders an error message when the query fails", () => {
      mockUseDocumentsPages.mockReturnValue(pagesState({ loadError: new Error("down") }));

      renderList();

      expect(screen.getByText(/couldn't load documents/i)).toBeInTheDocument();
    });
  });

  describe("failed filter fetch", () => {
    it("keeps the filter bar, shows an alert with Retry, and retry refetches", async () => {
      const user = userEvent.setup();
      const refetch = vi.fn().mockResolvedValue(undefined);
      mockUseDocumentsPages.mockReturnValue(pagesState({ loadError: new Error("down"), refetch }));

      renderList();

      expect(screen.getByRole("combobox")).toBeInTheDocument();
      expect(screen.getByRole("alert")).toHaveTextContent(/couldn't load documents/i);
      await user.click(screen.getByRole("button", { name: "Retry" }));
      expect(refetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("empty state", () => {
    it("moves focus back to the filter after Clear filter", async () => {
      const user = userEvent.setup();
      mockUseDocumentsPages.mockReturnValue(pagesState());

      renderList();
      await user.selectOptions(screen.getByRole("combobox"), "Job Description");
      await user.click(screen.getByRole("button", { name: "Clear filter" }));

      expect(screen.getByRole("combobox")).toHaveFocus();
    });

    it("announces the no-matches state in a status region", async () => {
      const user = userEvent.setup();
      mockUseDocumentsPages.mockReturnValue(pagesState());

      renderList();
      await user.selectOptions(screen.getByRole("combobox"), "Job Description");

      expect(screen.getByRole("status")).toHaveTextContent("No documents match this filter");
    });

    it("switches to no-matches when the last document under a filter is deleted", async () => {
      const user = userEvent.setup();
      const mockDelete = vi.fn().mockReturnValue({ unwrap: () => Promise.resolve() });
      mockUseDeleteDocumentMutation.mockReturnValue(
        [mockDelete, { isLoading: false }] as unknown as ReturnType<typeof useDeleteDocumentMutation>,
      );
      vi.spyOn(window, "confirm").mockReturnValue(true);
      mockUseDocumentsPages.mockReturnValue(pagesState({ documents: [makeDoc()], total: 1 }));

      const { rerender } = renderList();
      await user.selectOptions(screen.getByRole("combobox"), "Cover Letter");
      await user.click(screen.getByTitle("Delete"));
      await waitFor(() => expect(mockDelete).toHaveBeenCalledWith("doc-1"));

      // The delete invalidates the list; the refetched page is empty.
      mockUseDocumentsPages.mockReturnValue(pagesState({ documents: [], total: 0 }));
      rerender(
        <MemoryRouter>
          <DocumentList />
        </MemoryRouter>,
      );

      expect(screen.getByText("No documents match this filter")).toBeInTheDocument();
      expect(screen.queryByText("No documents yet")).not.toBeInTheDocument();
    });

    it("renders empty state heading when there are no documents", () => {
      mockUseDocumentsPages.mockReturnValue(pagesState());

      renderList();

      expect(screen.getByText("No documents yet")).toBeInTheDocument();
      expect(screen.queryByText(/match this filter/i)).not.toBeInTheDocument();
    });

    it("says nothing matches, and offers Clear filter, when a filter finds no documents", async () => {
      const user = userEvent.setup();
      mockUseDocumentsPages.mockReturnValue(pagesState());

      renderList();
      await user.selectOptions(screen.getByRole("combobox"), "Job Description");

      expect(screen.getByText("No documents match this filter")).toBeInTheDocument();
      expect(screen.queryByText("No documents yet")).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Clear filter" }));

      expect(mockUseDocumentsPages).toHaveBeenLastCalledWith({});
      expect(screen.getByRole("combobox")).toHaveValue("all");
      expect(screen.getByText("No documents yet")).toBeInTheDocument();
    });

    it("is not empty when the first page is empty but the server total says more exist", () => {
      mockUseDocumentsPages.mockReturnValue(pagesState({ documents: [], total: 75, hasNextPage: true }));

      renderList();

      expect(screen.getByRole("button", { name: "Load more" })).toBeInTheDocument();
      expect(screen.getByText("Showing 0 of 75 documents")).toBeInTheDocument();
      expect(screen.queryByText("No documents yet")).not.toBeInTheDocument();
      expect(screen.queryByText(/match this filter/i)).not.toBeInTheDocument();
    });
  });

  describe("loaded state", () => {
    it("renders document titles", () => {
      mockUseDocumentsPages.mockReturnValue(pagesState({ documents: [
            makeDoc({ id: "doc-1", title: "Cover Letter Draft" }),
            makeDoc({ id: "doc-2", title: "Acme Resume v2" }),
          ], total: 2 }));

      renderList();

      expect(screen.getByText("Cover Letter Draft")).toBeInTheDocument();
      expect(screen.getByText("Acme Resume v2")).toBeInTheDocument();
    });

    it("renders kind badges for each document", () => {
      mockUseDocumentsPages.mockReturnValue(pagesState({ documents: [makeDoc({ kind: "tailored_resume" })], total: 1 }));

      renderList();

      expect(screen.getByTestId("kind-badge")).toHaveTextContent("tailored_resume");
    });

    it("shows the kind filter select when hideKindFilter is not set", () => {
      mockUseDocumentsPages.mockReturnValue(pagesState());

      renderList();

      expect(screen.getByRole("combobox")).toBeInTheDocument();
    });

    it("asks the server for every type at first, then only the type picked", async () => {
      const user = userEvent.setup();
      mockUseDocumentsPages.mockReturnValue(pagesState());

      renderList({ applicationId: "app-1" });
      expect(mockUseDocumentsPages).toHaveBeenLastCalledWith({ application_id: "app-1" });

      await user.selectOptions(screen.getByRole("combobox"), "Job Description");
      expect(mockUseDocumentsPages).toHaveBeenLastCalledWith({ application_id: "app-1", kind: "job_description" });

      await user.selectOptions(screen.getByRole("combobox"), "All types");
      expect(mockUseDocumentsPages).toHaveBeenLastCalledWith({ application_id: "app-1" });
    });

    it("hides the kind filter when hideKindFilter is true", () => {
      mockUseDocumentsPages.mockReturnValue(pagesState());

      renderList({ hideKindFilter: true });

      expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    });
  });

  describe("paging", () => {
    it("shows how many are loaded of the real total, with no button when everything is loaded", () => {
      mockUseDocumentsPages.mockReturnValue(pagesState({ documents: [makeDoc()], total: 1 }));

      renderList();

      expect(screen.queryByText(/showing/i)).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
    });

    it("shows 'Showing X of Y' and loads the next page on Load more", async () => {
      const user = userEvent.setup();
      const loadMore = vi.fn();
      mockUseDocumentsPages.mockReturnValue(
        pagesState({
          documents: [makeDoc({ id: "doc-1" }), makeDoc({ id: "doc-2", title: "Second" })],
          total: 120,
          hasNextPage: true,
          loadMore,
        }),
      );

      renderList();

      expect(screen.getByText("Showing 2 of 120 documents")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Load more" }));
      expect(loadMore).toHaveBeenCalledTimes(1);
    });

    it("disables the button and says so while the next page loads", () => {
      mockUseDocumentsPages.mockReturnValue(
        pagesState({ documents: [makeDoc()], total: 120, hasNextPage: true, isFetchingNextPage: true }),
      );

      renderList();

      expect(screen.getByRole("button", { name: /loading more/i })).toBeDisabled();
    });

    it("keeps the rows and offers Try again when the next page fails", () => {
      mockUseDocumentsPages.mockReturnValue(
        pagesState({ documents: [makeDoc({ title: "Kept" })], total: 120, hasNextPage: true, isLoadMoreError: true }),
      );

      renderList();

      expect(screen.getByText("Kept")).toBeInTheDocument();
      expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load more documents.");
      expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    });

    it("shows skeleton rows, not the old list or a Load more button, while a new filter loads", () => {
      mockUseDocumentsPages.mockReturnValue(
        pagesState({ documents: [makeDoc({ title: "Old filter row" })], total: 120, hasNextPage: true, isFiltering: true }),
      );

      renderList();

      expect(screen.queryByText("Old filter row")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
      expect(screen.getAllByTestId("skeleton").length).toBeGreaterThanOrEqual(3);
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

      mockUseDocumentsPages.mockReturnValue(pagesState({ documents: [makeDoc()], total: 1 }));

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

      mockUseDocumentsPages.mockReturnValue(pagesState({ documents: [makeDoc()], total: 1 }));

      renderList();

      await user.click(screen.getByTitle("Delete"));

      expect(mockDelete).not.toHaveBeenCalled();
    });
  });

  describe("download", () => {
    const FILE_URL = "https://files.example.com/doc-1.pdf?sig=abc";

    function mockFileDoc() {
      mockUseDocumentsPages.mockReturnValue(pagesState({ documents: [makeDoc({ has_file: true, filename: "cv.pdf" })], total: 1 }));
    }

    function mockTrigger(result: () => Promise<{ url: string }>) {
      const trigger = vi.fn().mockReturnValue({ unwrap: result });
      mockUseLazyDownloadQuery.mockReturnValue([
        trigger,
        {},
      ] as unknown as ReturnType<typeof useLazyGetDocumentDownloadUrlQuery>);
      return trigger;
    }

    function stubPopup() {
      const popup = { opener: {}, close: vi.fn(), location: { href: "" } };
      const openSpy = vi
        .spyOn(window, "open")
        .mockReturnValue(popup as unknown as Window);
      return { popup, openSpy };
    }

    it("does not open anything on render or re-render", () => {
      const { openSpy } = stubPopup();
      const trigger = mockTrigger(() => Promise.resolve({ url: FILE_URL }));
      mockFileDoc();

      const { rerender } = renderList();
      rerender(
        <MemoryRouter>
          <DocumentList />
        </MemoryRouter>,
      );

      expect(openSpy).not.toHaveBeenCalled();
      expect(trigger).not.toHaveBeenCalled();
    });

    it("opens a blank window synchronously in the click, then navigates it once", async () => {
      const user = userEvent.setup();
      const { popup, openSpy } = stubPopup();
      const trigger = mockTrigger(() => Promise.resolve({ url: FILE_URL }));
      mockFileDoc();

      renderList();
      await user.click(screen.getByTitle("Download file"));

      await waitFor(() => expect(popup.location.href).toBe(FILE_URL));
      expect(trigger).toHaveBeenCalledTimes(1);
      expect(trigger).toHaveBeenCalledWith("doc-1");
      expect(openSpy).toHaveBeenCalledTimes(1);
      expect(openSpy).toHaveBeenCalledWith("", "_blank");
      expect(popup.opener).toBeNull();
      expect(popup.close).not.toHaveBeenCalled();
    });

    it("shows a busy, disabled button while the URL is fetched, then re-enables", async () => {
      const user = userEvent.setup();
      stubPopup();
      let resolve!: (v: { url: string }) => void;
      mockTrigger(() => new Promise((r) => (resolve = r)));
      mockFileDoc();

      renderList();
      const button = screen.getByTitle("Download file");
      await user.click(button);

      expect(button).toBeDisabled();
      expect(button).toHaveAttribute("aria-busy", "true");

      resolve({ url: FILE_URL });
      await waitFor(() => expect(button).toBeEnabled());
    });

    it("opens exactly once per click even when clicked again while in flight", async () => {
      const user = userEvent.setup();
      const { openSpy } = stubPopup();
      let resolve!: (v: { url: string }) => void;
      const trigger = mockTrigger(() => new Promise((r) => (resolve = r)));
      mockFileDoc();

      renderList();
      const button = screen.getByTitle("Download file");
      await user.click(button);
      await user.click(button);

      resolve({ url: FILE_URL });
      await waitFor(() => expect(button).toBeEnabled());
      expect(trigger).toHaveBeenCalledTimes(1);
      expect(openSpy).toHaveBeenCalledTimes(1);
    });

    it("closes the blank window and opens nothing when the link isn't http(s)", async () => {
      const user = userEvent.setup();
      const { popup } = stubPopup();
      mockTrigger(() => Promise.resolve({ url: "javascript:alert(1)" }));
      mockFileDoc();

      renderList();
      await user.click(screen.getByTitle("Download file"));

      await waitFor(() => expect(mockShowError).toHaveBeenCalledTimes(1));
      expect(mockShowError.mock.calls[0][0]).toMatch(/couldn't download/i);
      expect(popup.close).toHaveBeenCalledTimes(1);
      expect(popup.location.href).toBe("");
    });

    it("closes the blank window and shows an error toast when the fetch fails", async () => {
      const user = userEvent.setup();
      const { popup } = stubPopup();
      mockTrigger(() => Promise.reject(new Error("boom")));
      mockFileDoc();

      renderList();
      const button = screen.getByTitle("Download file");
      await user.click(button);

      await waitFor(() => expect(mockShowError).toHaveBeenCalledTimes(1));
      expect(mockShowError.mock.calls[0][0]).toMatch(/couldn't download/i);
      expect(popup.close).toHaveBeenCalledTimes(1);
      expect(popup.location.href).toBe("");
      expect(button).toBeEnabled();
    });
  });
});
