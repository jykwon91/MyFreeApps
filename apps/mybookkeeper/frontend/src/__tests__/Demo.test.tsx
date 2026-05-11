import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { BrowserRouter } from "react-router-dom";
import { store } from "@/shared/store";
import Demo from "@/admin/pages/Demo";
import type { DemoUser } from "@/shared/types/demo/demo-user";

const mockUsers: DemoUser[] = [
  {
    user_id: "u1",
    email: "demo+alpha@mybookkeeper.com",
    tag: "alpha",
    organization_id: "org1",
    organization_name: "Demo - alpha",
    created_at: "2026-01-15T10:00:00Z",
    upload_count: 3,
  },
  {
    user_id: "u2",
    email: "demo+beta@mybookkeeper.com",
    tag: "beta",
    organization_id: "org2",
    organization_name: "Demo - beta",
    created_at: "2026-02-01T10:00:00Z",
    upload_count: 0,
  },
];

const mockCreateTagged = vi.fn(() => ({
  unwrap: () =>
    Promise.resolve({
      message: "Demo user created",
      credentials: {
        email: "demo+test@mybookkeeper.com",
        password: "generated",
      },
      email_sent: false,
    }),
}));

const mockDeleteUser = vi.fn(() => ({
  unwrap: () => Promise.resolve({ message: "Deleted" }),
}));

const mockResetUser = vi.fn(() => ({
  unwrap: () =>
    Promise.resolve({
      message: "Reset",
      email: "demo+test@mybookkeeper.com",
      password: "newpass",
    }),
}));

vi.mock("@/shared/store/demoApi", () => ({
  useListDemoUsersQuery: vi.fn(() => ({
    data: { users: [], total: 0 },
    isLoading: false,
  })),
  useCreateTaggedDemoMutation: vi.fn(() => [
    mockCreateTagged,
    { isLoading: false, reset: vi.fn() },
  ]),
  useDeleteDemoUserMutation: vi.fn(() => [mockDeleteUser, { isLoading: false }]),
  useResetDemoUserMutation: vi.fn(() => [
    mockResetUser,
    { isLoading: false, reset: vi.fn() },
  ]),
}));

vi.mock("@/shared/hooks/useToast", () => ({
  useToast: () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
  }),
}));

import { useListDemoUsersQuery } from "@/shared/store/demoApi";

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <Provider store={store}>
      <BrowserRouter>{ui}</BrowserRouter>
    </Provider>,
  );
}

describe("Demo Admin Page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useListDemoUsersQuery).mockReturnValue({
      data: { users: [], total: 0 },
      isLoading: false,
    } as unknown as ReturnType<typeof useListDemoUsersQuery>);
  });

  it("renders the Demo Management title", () => {
    renderWithProviders(<Demo />);
    expect(screen.getByText("Demo Management")).toBeInTheDocument();
  });

  it("shows Demo Users section with empty state", () => {
    renderWithProviders(<Demo />);
    expect(screen.getByText("Demo Users")).toBeInTheDocument();
    expect(screen.getByText("0 demo users")).toBeInTheDocument();
    expect(
      screen.getByText("No demo users yet. Create one to get started."),
    ).toBeInTheDocument();
  });

  it("shows Create Demo User button", () => {
    renderWithProviders(<Demo />);
    expect(screen.getByText("Create Demo User")).toBeInTheDocument();
  });

  it("shows skeleton while loading", () => {
    vi.mocked(useListDemoUsersQuery).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as unknown as ReturnType<typeof useListDemoUsersQuery>);

    const { container } = renderWithProviders(<Demo />);
    const skeletons = container.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("renders demo users in the table when present", () => {
    vi.mocked(useListDemoUsersQuery).mockReturnValue({
      data: { users: mockUsers, total: 2 },
      isLoading: false,
    } as unknown as ReturnType<typeof useListDemoUsersQuery>);

    renderWithProviders(<Demo />);
    expect(screen.getByText("2 demo users")).toBeInTheDocument();
    expect(screen.getByText("alpha")).toBeInTheDocument();
    expect(screen.getByText("beta")).toBeInTheDocument();
    expect(screen.getByText("demo+alpha@mybookkeeper.com")).toBeInTheDocument();
    expect(screen.getByText("demo+beta@mybookkeeper.com")).toBeInTheDocument();
  });

  it("does not render legacy Demo Status or Actions sections", () => {
    renderWithProviders(<Demo />);
    expect(screen.queryByText("Demo Status")).not.toBeInTheDocument();
    expect(screen.queryByText("Active")).not.toBeInTheDocument();
    expect(screen.queryByText("Not Created")).not.toBeInTheDocument();
    expect(screen.queryByText("Reset Demo Data")).not.toBeInTheDocument();
    expect(screen.queryByText("Actions")).not.toBeInTheDocument();
  });

  it("shows user count reflecting the table data", () => {
    vi.mocked(useListDemoUsersQuery).mockReturnValue({
      data: { users: [mockUsers[0]], total: 1 },
      isLoading: false,
    } as unknown as ReturnType<typeof useListDemoUsersQuery>);

    renderWithProviders(<Demo />);
    expect(screen.getByText("1 demo user")).toBeInTheDocument();
  });
});
