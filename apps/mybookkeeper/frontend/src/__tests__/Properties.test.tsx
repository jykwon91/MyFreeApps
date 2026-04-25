import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { BrowserRouter } from "react-router-dom";
import { store } from "@/shared/store";
import Properties from "@/app/pages/Properties";
import type { Property } from "@/shared/types/property/property";

const mockProperties: Property[] = [
  {
    id: "prop-1",
    name: "Beach House",
    address: "123 Ocean Dr, Malibu, CA 90265",
    classification: "investment",
    type: "short_term",
    is_active: true,
    activity_periods: [],
    created_at: "2024-01-01T00:00:00Z",
  },
  {
    id: "prop-2",
    name: "Mountain Cabin",
    address: "456 Pine Rd, Aspen, CO 81611",
    classification: "investment",
    type: "long_term",
    is_active: false,
    activity_periods: [],
    created_at: "2024-06-01T00:00:00Z",
  },
];

vi.mock("@/shared/store/propertiesApi", () => ({
  useGetPropertiesQuery: vi.fn(() => ({
    data: mockProperties,
    isLoading: false,
  })),
  useCreatePropertyMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useUpdatePropertyMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useDeletePropertyMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
}));

vi.mock("@/shared/hooks/useOrgRole", () => ({
  useCanWrite: vi.fn(() => true),
}));

import { useGetPropertiesQuery } from "@/shared/store/propertiesApi";
import { useCanWrite } from "@/shared/hooks/useOrgRole";

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <Provider store={store}>
      <BrowserRouter>{ui}</BrowserRouter>
    </Provider>,
  );
}

describe("Properties", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.removeItem("props-info-dismissed");
    vi.mocked(useGetPropertiesQuery).mockReturnValue({
      data: mockProperties,
      isLoading: false,
    } as unknown as ReturnType<typeof useGetPropertiesQuery>);
    vi.mocked(useCanWrite).mockReturnValue(true);
  });

  afterEach(() => {
    localStorage.removeItem("props-info-dismissed");
  });

  it("renders the Properties title", () => {
    renderWithProviders(<Properties />);

    expect(screen.getByText("Properties")).toBeInTheDocument();
  });

  it("renders property names", () => {
    renderWithProviders(<Properties />);

    expect(screen.getByText("Beach House")).toBeInTheDocument();
    expect(screen.getByText("Mountain Cabin")).toBeInTheDocument();
  });

  it("renders property addresses", () => {
    renderWithProviders(<Properties />);

    expect(screen.getByText("123 Ocean Dr, Malibu, CA 90265")).toBeInTheDocument();
    expect(screen.getByText("456 Pine Rd, Aspen, CO 81611")).toBeInTheDocument();
  });

  it("renders property classification and rental type labels", () => {
    renderWithProviders(<Properties />);

    expect(screen.getAllByText(/Investment Property/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Short-Term Rental/)).toBeInTheDocument();
    expect(screen.getByText(/Long-Term Rental/)).toBeInTheDocument();
  });

  it("shows Inactive badge for inactive properties", () => {
    renderWithProviders(<Properties />);

    expect(screen.getByText("Inactive")).toBeInTheDocument();
  });

  it("shows Deactivate button for active properties", () => {
    renderWithProviders(<Properties />);

    expect(screen.getByText("Deactivate")).toBeInTheDocument();
  });

  it("shows Activate button for inactive properties", () => {
    renderWithProviders(<Properties />);

    expect(screen.getByText("Activate")).toBeInTheDocument();
  });

  it("renders the Add Property form with name input", () => {
    renderWithProviders(<Properties />);

    expect(screen.getByPlaceholderText("e.g. Beach House Unit A")).toBeInTheDocument();
  });

  it("renders the Add Property button", () => {
    renderWithProviders(<Properties />);

    expect(screen.getByText("Add property")).toBeInTheDocument();
  });

  it("renders classification and rental type selects in the form", () => {
    renderWithProviders(<Properties />);

    expect(screen.getByText("Classification")).toBeInTheDocument();
    expect(screen.getByText("Investment Property")).toBeInTheDocument();
  });

  it("shows empty state when no properties", () => {
    vi.mocked(useGetPropertiesQuery).mockReturnValue({
      data: [],
      isLoading: false,
    } as unknown as ReturnType<typeof useGetPropertiesQuery>);

    renderWithProviders(<Properties />);

    expect(screen.getByText("Add your first property above — I'll use it to organize your transactions and put expenses on the right tax forms.")).toBeInTheDocument();
  });

  it("shows skeleton when loading", () => {
    vi.mocked(useGetPropertiesQuery).mockReturnValue({
      data: [],
      isLoading: true,
    } as unknown as ReturnType<typeof useGetPropertiesQuery>);

    const { container } = renderWithProviders(<Properties />);

    const skeletons = container.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThanOrEqual(1);
  });

  it("Add property button is disabled when name is empty", () => {
    renderWithProviders(<Properties />);

    const addBtn = screen.getByText("Add property");
    expect(addBtn).toBeDisabled();
  });

  it("shows info banner when not dismissed", () => {
    renderWithProviders(<Properties />);

    expect(screen.getByText(/Properties let me know where each expense belongs/)).toBeInTheDocument();
  });

  it("hides info banner when dismissed in localStorage", () => {
    localStorage.setItem("props-info-dismissed", "1");
    renderWithProviders(<Properties />);

    expect(screen.queryByText(/Properties let me know where each expense belongs/)).not.toBeInTheDocument();
  });

  it("dismisses info banner on click", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Properties />);

    expect(screen.getByText(/Properties let me know where each expense belongs/)).toBeInTheDocument();

    await user.click(screen.getByLabelText("Dismiss"));

    expect(screen.queryByText(/Properties let me know where each expense belongs/)).not.toBeInTheDocument();
    expect(localStorage.getItem("props-info-dismissed")).toBe("1");
  });

  it("shows improved empty state message when no properties", () => {
    vi.mocked(useGetPropertiesQuery).mockReturnValue({
      data: [],
      isLoading: false,
    } as unknown as ReturnType<typeof useGetPropertiesQuery>);

    renderWithProviders(<Properties />);

    expect(screen.getByText(/Add your first property above/)).toBeInTheDocument();
  });
});

describe("Properties — viewer role", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.removeItem("props-info-dismissed");
    vi.mocked(useGetPropertiesQuery).mockReturnValue({
      data: mockProperties,
      isLoading: false,
    } as unknown as ReturnType<typeof useGetPropertiesQuery>);
    vi.mocked(useCanWrite).mockReturnValue(false);
  });

  afterEach(() => {
    localStorage.removeItem("props-info-dismissed");
  });

  it("hides the Add Property form for viewer", () => {
    renderWithProviders(<Properties />);

    expect(screen.queryByPlaceholderText("e.g. Beach House Unit A")).not.toBeInTheDocument();
    expect(screen.queryByText("Add property")).not.toBeInTheDocument();
  });

  it("still renders existing property names for viewer", () => {
    renderWithProviders(<Properties />);

    expect(screen.getByText("Beach House")).toBeInTheDocument();
    expect(screen.getByText("Mountain Cabin")).toBeInTheDocument();
  });

  it("hides edit and delete action buttons for viewer", () => {
    renderWithProviders(<Properties />);

    expect(screen.queryByText("Deactivate")).not.toBeInTheDocument();
    expect(screen.queryByText("Activate")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Edit")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Remove")).not.toBeInTheDocument();
  });
});
