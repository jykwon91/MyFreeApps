import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import CustomersPage from "../Customers";
import type { CustomerListItem } from "@/types/customer/customer";

const ana: CustomerListItem = {
  id: "c1",
  name: "Ana Lopez",
  phone: "5125550101",
  notes: null,
  order_count: 1,
  last_order_at: null,
};

interface PagesState {
  items: CustomerListItem[];
  total: number;
  hasData: boolean;
  isFiltering: boolean;
  loadError: unknown;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isLoadMoreError: boolean;
}

const loaded: PagesState = {
  items: [ana],
  total: 1,
  hasData: true,
  isFiltering: false,
  loadError: undefined,
  hasNextPage: false,
  isFetchingNextPage: false,
  isLoadMoreError: false,
};

let stateFor: (search: string | undefined) => PagesState;
const loadMore = vi.fn();

vi.mock("@platform/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@platform/ui")>()),
  useDebouncedValue: <T,>(value: T) => value,
}));

vi.mock("@/hooks/useCustomersPages", () => ({
  useCustomersPages: (args: { search?: string }) => ({
    ...stateFor(args.search),
    loadMore,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/store/customersApi", () => ({
  useUpdateCustomerNotesMutation: () => [vi.fn(), { isLoading: false }],
}));

describe("Customers page search results", () => {
  beforeEach(() => {
    stateFor = (search) =>
      search === undefined
        ? loaded
        : { ...loaded, loadError: { status: 500 } };
  });

  it("shows the error and no rows from the previous search when a search fails", () => {
    render(<CustomersPage />);
    expect(screen.getByText("Ana Lopez")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Search by name or phone..."), { target: { value: "zzz" } });
    expect(screen.getByText("Could not load customers")).toBeInTheDocument();
    expect(screen.queryByText("Ana Lopez")).toBeNull();
  });

  it("shows no old rows while a new search loads", () => {
    stateFor = (search) => (search === undefined ? loaded : { ...loaded, isFiltering: true });
    const { container } = render(<CustomersPage />);
    fireEvent.change(screen.getByPlaceholderText("Search by name or phone..."), { target: { value: "zzz" } });
    expect(screen.queryByText("Ana Lopez")).toBeNull();
    expect(container.querySelectorAll("li")).toHaveLength(0);
  });
});

describe("Customers page paging", () => {
  beforeEach(() => {
    loadMore.mockClear();
    stateFor = () => ({ ...loaded, total: 120, hasNextPage: true });
  });

  it("says how many are showing and loads the next page on Load more", () => {
    render(<CustomersPage />);
    expect(screen.getByText("Showing 1 of 120")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(loadMore).toHaveBeenCalledTimes(1);
  });

  it("hides Load more on the last page", () => {
    stateFor = () => loaded;
    render(<CustomersPage />);
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("disables Load more while the next page loads", () => {
    stateFor = () => ({ ...loaded, hasNextPage: true, isFetchingNextPage: true });
    render(<CustomersPage />);
    expect(screen.getByRole("button", { name: /Loading/ })).toBeDisabled();
  });

  it("keeps the rows and offers a retry when the next page fails", () => {
    stateFor = () => ({ ...loaded, hasNextPage: true, isLoadMoreError: true });
    render(<CustomersPage />);
    expect(screen.getByText("Ana Lopez")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load more customers");
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(loadMore).toHaveBeenCalledTimes(1);
  });
});
