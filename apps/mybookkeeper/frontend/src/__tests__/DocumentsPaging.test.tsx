/**
 * Against the real RTK Query hooks and a fake server: the Documents page reaches documents past the
 * first page, and "select all" + bulk delete reach every matching document, loaded or not.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { configureStore } from "@reduxjs/toolkit";
import Documents from "@/app/pages/Documents";
import { baseApi } from "@/shared/store/baseApi";
import documentUploadReducer from "@/shared/store/documentUploadSlice";
import { DOCUMENT_PAGE_SIZE } from "@mybookkeeper/api-client/constants/documentPaging";
import { FAILED_EVERY, TOTAL, requests, startDocumentsServer, stopDocumentsServer } from "@/test/documents-page-server";

vi.mock("@/app/features/documents/DocumentUploadZone", () => ({ default: () => null }));
vi.mock("@/shared/hooks/useOrgRole", () => ({ useCanWrite: () => true }));

const FAILED_TOTAL = TOTAL / FAILED_EVERY;

function renderPage(): void {
  const store = configureStore({
    reducer: { [baseApi.reducerPath]: baseApi.reducer, documentUpload: documentUploadReducer },
    middleware: (getDefault) => getDefault().concat(baseApi.middleware),
  });
  render(
    <Provider store={store}>
      <MemoryRouter>
        <Documents />
      </MemoryRouter>
    </Provider>,
  );
}

function table(): HTMLElement {
  return screen.getByRole("table");
}

/** The skeleton is a table too, so wait for the loaded one to hold the row. */
async function findRow(fileName: string): Promise<HTMLElement> {
  return waitFor(() => within(table()).getByText(fileName));
}

function deletedIds(): string[] {
  return requests
    .filter((request) => request.path === "/documents/bulk-delete")
    .flatMap((request) => (request.body as { ids: string[] }).ids);
}

beforeEach(() => {
  localStorage.setItem("docs-info-dismissed", "1");
  startDocumentsServer();
});

afterEach(() => {
  stopDocumentsServer();
  localStorage.removeItem("docs-info-dismissed");
});

describe("Documents paging", () => {
  it("loads the next page with Load more, reaching a document past the first page", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await findRow("doc-1.pdf")).toBeInTheDocument();
    expect(within(table()).queryByText(`doc-${DOCUMENT_PAGE_SIZE + 1}.pdf`)).toBeNull();
    expect(screen.getByTestId("documents-shown-count")).toHaveTextContent(`${DOCUMENT_PAGE_SIZE} of ${TOTAL} documents`);

    await user.click(screen.getByTestId("load-more-button"));

    expect(await findRow(`doc-${DOCUMENT_PAGE_SIZE + 1}.pdf`)).toBeInTheDocument();
    const offsets = requests.filter((r) => r.path === "/documents/page" && !r.query.has("statuses")).map((r) => r.query.get("offset"));
    expect(offsets).toContain(String(DOCUMENT_PAGE_SIZE));
  });

  it("counts failed documents across the workspace, not only the loaded ones", async () => {
    renderPage();

    expect(await screen.findByText(new RegExp(`I had trouble with ${FAILED_TOTAL} documents`))).toBeInTheDocument();
  });

  it("selects every matching document, loaded or not, and bulk deletes them all", async () => {
    const user = userEvent.setup();
    renderPage();
    await findRow("doc-1.pdf");

    await user.click(screen.getByRole("checkbox", { name: "Select all documents" }));
    expect(await screen.findByText(`${TOTAL} selected`)).toBeInTheDocument();

    await user.click(screen.getByText("Delete selected"));
    const deleteButtons = screen.getAllByText("Delete");
    await user.click(deleteButtons[deleteButtons.length - 1]);

    await waitFor(() => expect(deletedIds()).toHaveLength(TOTAL));
    expect(deletedIds()).toContain(`doc-${TOTAL}`);
    await waitFor(() => expect(screen.queryByText(/selected$/)).toBeNull());
  });

  it("checks the selection when the filters change, keeping only what still matches", async () => {
    const user = userEvent.setup();
    renderPage();
    await findRow("doc-1.pdf");

    await user.click(screen.getByRole("checkbox", { name: "Select all documents" }));
    await screen.findByText(`${TOTAL} selected`);
    await act(async () => {
      await user.click(screen.getByText("Show failed"));
    });

    expect(await screen.findByText(`${FAILED_TOTAL} selected`)).toBeInTheDocument();
    const statusQueries = requests.filter((r) => r.path === "/documents/selection").map((r) => r.query.getAll("statuses"));
    expect(statusQueries).toContainEqual(["failed"]);
  });
});
