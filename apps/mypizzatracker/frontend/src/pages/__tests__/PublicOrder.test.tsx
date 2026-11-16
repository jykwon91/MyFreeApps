import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import PublicOrderPage from "../PublicOrder";

interface QueryState {
  data: unknown;
  isLoading: boolean;
  isError: boolean;
  error?: { status: number };
}

let drop: QueryState;
let menu: QueryState;

vi.mock("@/store/publicApi", () => ({
  useGetCurrentPublicDropQuery: () => ({ ...drop, refetch: vi.fn() }),
  useGetPublicMenuQuery: () => ({ ...menu, refetch: vi.fn() }),
}));
vi.mock("@/features/public-order/PageShell", () => ({ default: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock("@/features/public-order/LoadingShell", () => ({ default: () => <div>loading</div> }));
vi.mock("@/features/public-order/NoActiveDrop", () => ({ default: () => <div>no active drop</div> }));
vi.mock("@/features/public-order/DropHeader", () => ({ default: () => <div>drop header</div> }));
vi.mock("@/features/public-order/OrderBuilder", () => ({ default: () => <div>order builder</div> }));

const LOADED: QueryState = { data: { id: "d1" }, isLoading: false, isError: false };

describe("PublicOrderPage when the drop and menu are refetched", () => {
  beforeEach(() => {
    drop = LOADED;
    menu = { data: { items: [] }, isLoading: false, isError: false };
  });

  it("keeps the order being built when a refetch of the drop fails", () => {
    drop = { ...LOADED, isError: true, error: { status: 500 } };
    render(<PublicOrderPage />);

    expect(screen.getByText("order builder")).toBeInTheDocument();
    expect(screen.queryByText("Could not load the current drop")).not.toBeInTheDocument();
  });

  it("keeps the order being built when a refetch of the menu fails", () => {
    menu = { data: { items: [] }, isLoading: false, isError: true, error: { status: 500 } };
    render(<PublicOrderPage />);

    expect(screen.getByText("order builder")).toBeInTheDocument();
    expect(screen.queryByText("Could not load the menu")).not.toBeInTheDocument();
  });

  it("says the drop couldn't load when it never did", () => {
    drop = { data: undefined, isLoading: false, isError: true, error: { status: 500 } };
    render(<PublicOrderPage />);

    expect(screen.getByText("Could not load the current drop")).toBeInTheDocument();
  });

  it("says the menu couldn't load when it never did", () => {
    menu = { data: undefined, isLoading: false, isError: true, error: { status: 500 } };
    render(<PublicOrderPage />);

    expect(screen.getByText("Could not load the menu")).toBeInTheDocument();
  });

  it("still says there is no active drop on a 404", () => {
    drop = { data: undefined, isLoading: false, isError: true, error: { status: 404 } };
    render(<PublicOrderPage />);

    expect(screen.getByText("no active drop")).toBeInTheDocument();
  });
});
