import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { BrowserRouter } from "react-router-dom";
import { store } from "@/shared/store";
import Admin from "@/admin/pages/Admin";
import type { UserProfile } from "@/shared/types/user/user";
import type { PlatformStats } from "@/shared/types/admin/platform-stats";
import type { AdminOrg } from "@/shared/types/admin/admin-org";

const mockStats: PlatformStats = {
  total_users: 42,
  active_users: 38,
  inactive_users: 4,
  total_organizations: 7,
  total_transactions: 1500,
  total_documents: 320,
};

const mockUsers: UserProfile[] = [
  {
    id: "user-1",
    email: "alice@example.com",
    name: "Alice Smith",
    role: "admin",
    is_active: true,
    is_superuser: true,
    is_verified: true,
  },
  {
    id: "user-2",
    email: "bob@example.com",
    name: "Bob Jones",
    role: "user",
    is_active: false,
    is_superuser: false,
    is_verified: false,
  },
];

const mockOrgs: AdminOrg[] = [
  {
    id: "org-1",
    name: "Acme Corp",
    created_by: "user-1",
    owner_email: "alice@example.com",
    created_at: "2024-03-15T00:00:00Z",
    member_count: 5,
    transaction_count: 200,
  },
];

vi.mock("@/shared/store/adminApi", () => ({
  useListUsersQuery: vi.fn(() => ({ data: mockUsers, isLoading: false })),
  useGetPlatformStatsQuery: vi.fn(() => ({ data: mockStats, isLoading: false })),
  useListOrgsQuery: vi.fn(() => ({ data: mockOrgs, isLoading: false })),
  useUpdateUserRoleMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useDeactivateUserMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useActivateUserMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useToggleSuperuserMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
}));

vi.mock("@/shared/hooks/useCurrentUser", () => ({
  useCurrentUser: vi.fn(() => ({
    user: { id: "current-user-99", is_superuser: true },
  })),
}));

vi.mock("@/shared/hooks/useToast", () => ({
  useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}));

import {
  useListUsersQuery,
  useGetPlatformStatsQuery,
  useListOrgsQuery,
} from "@/shared/store/adminApi";
import { useCurrentUser } from "@/shared/hooks/useCurrentUser";

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <Provider store={store}>
      <BrowserRouter>{ui}</BrowserRouter>
    </Provider>,
  );
}

describe("Admin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useListUsersQuery).mockReturnValue({
      data: mockUsers,
      isLoading: false,
    } as unknown as ReturnType<typeof useListUsersQuery>);
    vi.mocked(useGetPlatformStatsQuery).mockReturnValue({
      data: mockStats,
      isLoading: false,
    } as unknown as ReturnType<typeof useGetPlatformStatsQuery>);
    vi.mocked(useListOrgsQuery).mockReturnValue({
      data: mockOrgs,
      isLoading: false,
    } as unknown as ReturnType<typeof useListOrgsQuery>);
    vi.mocked(useCurrentUser).mockReturnValue({
      user: { id: "current-user-99", is_superuser: true } as UserProfile,
      isLoading: false,
      isError: false,
      error: undefined,
    });
  });

  it("renders the Admin title and subtitle", () => {
    renderWithProviders(<Admin />);
    expect(screen.getAllByText("Admin").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Platform administration")).toBeInTheDocument();
  });

  it("renders stats cards with platform numbers", () => {
    renderWithProviders(<Admin />);
    expect(screen.getByText("Total Users")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("38 active, 4 inactive")).toBeInTheDocument();
    expect(screen.getAllByText("Organizations").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("Transactions")).toBeInTheDocument();
    expect(screen.getByText("1,500")).toBeInTheDocument();
    expect(screen.getByText("Documents")).toBeInTheDocument();
    expect(screen.getByText("320")).toBeInTheDocument();
  });

  it("renders Users and Organizations tabs", () => {
    renderWithProviders(<Admin />);
    expect(screen.getByRole("tab", { name: "Users" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Organizations" })).toBeInTheDocument();
  });

  it("defaults to the Users tab selected", () => {
    renderWithProviders(<Admin />);
    expect(screen.getByRole("tab", { name: "Users" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Organizations" })).toHaveAttribute("aria-selected", "false");
  });

  it("renders user emails and names in the table", () => {
    renderWithProviders(<Admin />);
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    expect(screen.getByText("bob@example.com")).toBeInTheDocument();
    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    expect(screen.getByText("Bob Jones")).toBeInTheDocument();
  });

  it("shows Active and Inactive user statuses", () => {
    renderWithProviders(<Admin />);
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Inactive")).toBeInTheDocument();
  });

  it("shows Superuser badge for superusers", () => {
    renderWithProviders(<Admin />);
    expect(screen.getAllByText("Superuser").length).toBeGreaterThanOrEqual(1);
  });

  it("shows Verified and Unverified badges based on user state", () => {
    renderWithProviders(<Admin />);
    expect(screen.getAllByText("Verified").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Unverified")).toBeInTheDocument();
  });

  it("shows Deactivate button for active non-self users", () => {
    renderWithProviders(<Admin />);
    expect(screen.getByText("Deactivate")).toBeInTheDocument();
  });

  it("shows Activate button for inactive non-self users", () => {
    renderWithProviders(<Admin />);
    expect(screen.getByText("Activate")).toBeInTheDocument();
  });

  it("renders user search input", () => {
    renderWithProviders(<Admin />);
    expect(screen.getByPlaceholderText("Search by email or name...")).toBeInTheDocument();
  });

  it("filters users by email when search query is typed", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Admin />);
    const search = screen.getByPlaceholderText("Search by email or name...");
    await user.type(search, "alice");
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    expect(screen.queryByText("bob@example.com")).not.toBeInTheDocument();
  });

  it("filters users by name when search matches name field", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Admin />);
    const search = screen.getByPlaceholderText("Search by email or name...");
    await user.type(search, "Jones");
    expect(screen.getByText("bob@example.com")).toBeInTheDocument();
    expect(screen.queryByText("alice@example.com")).not.toBeInTheDocument();
  });

  it("shows No users found when search has no matches", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Admin />);
    const search = screen.getByPlaceholderText("Search by email or name...");
    await user.type(search, "zzznomatch");
    expect(screen.getByText("No users found")).toBeInTheDocument();
  });

  it("switches to Organizations tab and shows org data", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Admin />);
    await user.click(screen.getByRole("tab", { name: "Organizations" }));
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
  });

  it("hides user search when Organizations tab is active", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Admin />);
    await user.click(screen.getByRole("tab", { name: "Organizations" }));
    expect(screen.queryByPlaceholderText("Search by email or name...")).not.toBeInTheDocument();
  });

  it("shows org table headers on Organizations tab", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Admin />);
    await user.click(screen.getByRole("tab", { name: "Organizations" }));
    expect(screen.getByText("Members")).toBeInTheDocument();
    expect(screen.getByText("Owner")).toBeInTheDocument();
  });

  it("shows No organizations found when orgs list is empty", async () => {
    vi.mocked(useListOrgsQuery).mockReturnValue({
      data: [],
      isLoading: false,
    } as unknown as ReturnType<typeof useListOrgsQuery>);
    const user = userEvent.setup();
    renderWithProviders(<Admin />);
    await user.click(screen.getByRole("tab", { name: "Organizations" }));
    expect(screen.getByText("No organizations found")).toBeInTheDocument();
  });

  it("opens deactivation confirm dialog when Deactivate is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Admin />);
    await user.click(screen.getByText("Deactivate"));
    expect(screen.getByText("Deactivate user?")).toBeInTheDocument();
    expect(screen.getByText(/Are you sure you want to deactivate alice@example.com/)).toBeInTheDocument();
  });

  it("opens activation confirm dialog when Activate is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Admin />);
    await user.click(screen.getByText("Activate"));
    expect(screen.getByText("Activate user?")).toBeInTheDocument();
    expect(screen.getByText(/Are you sure you want to activate bob@example.com/)).toBeInTheDocument();
  });

  it("closes confirm dialog when Cancel is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Admin />);
    await user.click(screen.getByText("Deactivate"));
    expect(screen.getByText("Deactivate user?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(screen.queryByText("Deactivate user?")).not.toBeInTheDocument();
  });

  it("shows skeleton when any query is loading", () => {
    vi.mocked(useListUsersQuery).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as unknown as ReturnType<typeof useListUsersQuery>);
    const { container } = renderWithProviders(<Admin />);
    const skeletons = container.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("shows No users found when user list is empty", () => {
    vi.mocked(useListUsersQuery).mockReturnValue({
      data: [],
      isLoading: false,
    } as unknown as ReturnType<typeof useListUsersQuery>);
    renderWithProviders(<Admin />);
    expect(screen.getByText("No users found")).toBeInTheDocument();
  });

  it("shows Grant SU button for non-superuser when viewer is superuser", () => {
    renderWithProviders(<Admin />);
    expect(screen.getByText("Grant SU")).toBeInTheDocument();
  });

  it("opens superuser confirm dialog when Grant SU is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Admin />);
    await user.click(screen.getByText("Grant SU"));
    expect(screen.getByText("Toggle superuser?")).toBeInTheDocument();
    expect(screen.getByText(/toggle superuser status for bob@example.com/i)).toBeInTheDocument();
  });

  it("hides SU buttons when viewer is not a superuser", () => {
    vi.mocked(useCurrentUser).mockReturnValue({
      user: { id: "current-user-99", is_superuser: false } as UserProfile,
      isLoading: false,
      isError: false,
      error: undefined,
    });
    renderWithProviders(<Admin />);
    expect(screen.queryByText("Grant SU")).not.toBeInTheDocument();
    expect(screen.queryByText("Revoke SU")).not.toBeInTheDocument();
  });

  it("shows Revoke SU for a non-self superuser when viewer is superuser", () => {
    vi.mocked(useListUsersQuery).mockReturnValue({
      data: [{ ...mockUsers[0], id: "other-su", email: "super2@example.com" }],
      isLoading: false,
    } as unknown as ReturnType<typeof useListUsersQuery>);
    renderWithProviders(<Admin />);
    expect(screen.getByText("Revoke SU")).toBeInTheDocument();
  });
});
