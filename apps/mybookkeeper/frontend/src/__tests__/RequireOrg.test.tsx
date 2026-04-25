import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { baseApi } from "@/shared/store/baseApi";
import organizationReducer from "@/shared/store/organizationSlice";
import RequireOrg from "@/shared/components/RequireOrg";

vi.mock("@/shared/store/organizationsApi", () => ({
  useListOrganizationsQuery: vi.fn(),
}));

vi.mock("@/shared/store/taxProfileApi", () => ({
  useGetTaxProfileQuery: vi.fn().mockReturnValue({ data: undefined, isLoading: false }),
}));

vi.mock("@/app/features/organizations/CreateOrgPrompt", () => ({
  default: () => <div data-testid="create-org-prompt">Create your organization</div>,
}));

vi.mock("@/shared/components/ui/Skeleton", () => ({
  default: ({ className }: { className: string }) => (
    <div data-testid="skeleton" className={className} />
  ),
}));

import { useListOrganizationsQuery } from "@/shared/store/organizationsApi";

function createStore() {
  return configureStore({
    reducer: {
      [baseApi.reducerPath]: baseApi.reducer,
      organization: organizationReducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(baseApi.middleware),
  });
}

function renderWithProviders(queryState: Record<string, unknown>) {
  vi.mocked(useListOrganizationsQuery).mockReturnValue(
    queryState as unknown as ReturnType<typeof useListOrganizationsQuery>,
  );

  return render(
    <Provider store={createStore()}>
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route
            path="/"
            element={
              <RequireOrg>
                <div data-testid="protected-content">Protected</div>
              </RequireOrg>
            }
          />
          <Route path="/login" element={<div data-testid="login-page">Login</div>} />
          <Route path="/onboarding" element={<div data-testid="onboarding-page">Onboarding</div>} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
}

describe("RequireOrg", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows skeleton during initial load", () => {
    renderWithProviders({
      data: undefined,
      isLoading: true,
      isError: false,
      error: undefined,
      refetch: vi.fn(),
    });

    expect(screen.getAllByTestId("skeleton").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("protected-content")).not.toBeInTheDocument();
  });

  it("shows CreateOrgPrompt when user has no organizations", () => {
    renderWithProviders({
      data: [],
      isLoading: false,
      isError: false,
      error: undefined,
      refetch: vi.fn(),
    });

    expect(screen.getByTestId("create-org-prompt")).toBeInTheDocument();
    expect(screen.queryByTestId("protected-content")).not.toBeInTheDocument();
  });

  it("renders children when organizations exist", () => {
    renderWithProviders({
      data: [{ id: "org-1", name: "Test Org", org_role: "owner" as const, is_demo: false }],
      isLoading: false,
      isError: false,
      error: undefined,
      refetch: vi.fn(),
    });

    expect(screen.getByTestId("protected-content")).toBeInTheDocument();
  });

  // ── Regression: 401 error must redirect to login, not show CreateOrgPrompt ──

  it("redirects to /login on 401 API error instead of showing CreateOrgPrompt", () => {
    renderWithProviders({
      data: undefined,
      isLoading: false,
      isError: true,
      error: { status: 401, data: "Unauthorized" },
      refetch: vi.fn(),
    });

    expect(screen.getByTestId("login-page")).toBeInTheDocument();
    expect(screen.queryByTestId("create-org-prompt")).not.toBeInTheDocument();
  });

  // ── Regression: non-401 errors show error state with retry, not CreateOrgPrompt ──

  it("shows error state with retry button on non-401 API error", () => {
    renderWithProviders({
      data: undefined,
      isLoading: false,
      isError: true,
      error: { status: 500, data: "Internal Server Error" },
      refetch: vi.fn(),
    });

    expect(screen.getByText("Something went wrong loading your organizations.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.queryByTestId("create-org-prompt")).not.toBeInTheDocument();
  });

  it("calls refetch when Try again button is clicked", async () => {
    const refetch = vi.fn();
    vi.mocked(useListOrganizationsQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: { status: 500, data: "Internal Server Error" },
      refetch,
    } as unknown as ReturnType<typeof useListOrganizationsQuery>);

    render(
      <Provider store={createStore()}>
        <MemoryRouter>
          <RequireOrg>
            <div>Protected</div>
          </RequireOrg>
        </MemoryRouter>
      </Provider>,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(refetch).toHaveBeenCalledOnce();
  });

  it("shows error state on network error (no status code)", () => {
    renderWithProviders({
      data: undefined,
      isLoading: false,
      isError: true,
      error: { status: undefined, data: "Network Error" },
      refetch: vi.fn(),
    });

    expect(screen.getByText("Something went wrong loading your organizations.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.queryByTestId("create-org-prompt")).not.toBeInTheDocument();
  });
});
