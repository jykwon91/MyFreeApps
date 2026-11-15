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

interface QueryState {
  data?: CustomerListItem[];
  currentData?: CustomerListItem[];
  isError: boolean;
  error?: unknown;
}

let stateFor: (search: string | undefined) => QueryState;

vi.mock("@platform/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@platform/ui")>()),
  useDebouncedValue: <T,>(value: T) => value,
}));

vi.mock("@/store/customersApi", () => ({
  useListCustomersQuery: (args?: { search: string }) => ({
    ...stateFor(args?.search),
    refetch: vi.fn(),
  }),
  useUpdateCustomerNotesMutation: () => [vi.fn(), { isLoading: false }],
}));

describe("Customers page search results", () => {
  beforeEach(() => {
    // Like RTK Query: after a success, `data` keeps the old rows for any later argument.
    stateFor = (search) =>
      search === undefined
        ? { data: [ana], currentData: [ana], isError: false }
        : { data: [ana], currentData: undefined, isError: true, error: { status: 500 } };
  });

  it("shows the error and no rows from the previous search when a search fails", () => {
    render(<CustomersPage />);
    expect(screen.getByText("Ana Lopez")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Search by name or phone..."), { target: { value: "zzz" } });
    expect(screen.getByText("Could not load customers")).toBeInTheDocument();
    expect(screen.queryByText("Ana Lopez")).toBeNull();
  });

  it("shows no old rows while a new search loads", () => {
    stateFor = (search) =>
      search === undefined
        ? { data: [ana], currentData: [ana], isError: false }
        : { data: [ana], currentData: undefined, isError: false };
    const { container } = render(<CustomersPage />);
    fireEvent.change(screen.getByPlaceholderText("Search by name or phone..."), { target: { value: "zzz" } });
    expect(screen.queryByText("Ana Lopez")).toBeNull();
    expect(container.querySelectorAll("li")).toHaveLength(0);
  });
});
