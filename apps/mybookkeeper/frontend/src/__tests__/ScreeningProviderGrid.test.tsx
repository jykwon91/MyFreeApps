import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { store } from "@/shared/store";

const getProvidersMock = vi.fn();
const triggerRedirectMock = vi.fn();

vi.mock("@/shared/store/screeningApi", () => ({
  useGetScreeningProvidersQuery: () => getProvidersMock(),
  useLazyGetScreeningRedirectQuery: () => [triggerRedirectMock, {}],
}));

const showErrorMock = vi.fn();
vi.mock("@/shared/lib/toast-store", () => ({
  showError: (m: string) => showErrorMock(m),
  showSuccess: vi.fn(),
}));

import ScreeningProviderGrid from "@/app/features/screening/ScreeningProviderGrid";

const MOCK_PROVIDERS = {
  providers: [
    {
      name: "keycheck",
      label: "KeyCheck",
      description: "Comprehensive background check.",
      cost_label: "Free",
      turnaround_label: "Usually 1–2 days",
      external_url: "https://keycheck.example",
    },
    {
      name: "rentspree",
      label: "RentSpree",
      description: "Applicant-pays screening.",
      cost_label: "Paid by applicant",
      turnaround_label: "Usually same day",
      external_url: "https://rentspree.example",
    },
  ],
};

function renderGrid(openWindow: ((url: string) => void) | undefined = vi.fn()) {
  return render(
    <Provider store={store}>
      <ScreeningProviderGrid applicantId="app-1" openWindow={openWindow} />
    </Provider>,
  );
}

describe("ScreeningProviderGrid", () => {
  beforeEach(() => {
    getProvidersMock.mockReset();
    triggerRedirectMock.mockReset();
    showErrorMock.mockReset();
  });

  it("shows a skeleton while providers are loading", () => {
    getProvidersMock.mockReturnValue({ isLoading: true, isError: false, data: undefined });
    renderGrid();
    expect(screen.getByTestId("screening-provider-grid-skeleton")).toBeInTheDocument();
  });

  it("renders both provider cards when loaded", () => {
    getProvidersMock.mockReturnValue({ isLoading: false, isError: false, data: MOCK_PROVIDERS });
    renderGrid();
    expect(screen.getByTestId("screening-provider-card-keycheck")).toBeInTheDocument();
    expect(screen.getByTestId("screening-provider-card-rentspree")).toBeInTheDocument();
  });

  it("shows provider label, cost, and turnaround on each card", () => {
    getProvidersMock.mockReturnValue({ isLoading: false, isError: false, data: MOCK_PROVIDERS });
    renderGrid();
    expect(screen.getByText("KeyCheck")).toBeInTheDocument();
    expect(screen.getByText("Free")).toBeInTheDocument();
    expect(screen.getByText("Usually 1–2 days")).toBeInTheDocument();
    expect(screen.getByText("RentSpree")).toBeInTheDocument();
    expect(screen.getByText("Paid by applicant")).toBeInTheDocument();
  });

  it("shows an error message when providers fail to load", () => {
    getProvidersMock.mockReturnValue({ isLoading: false, isError: true, data: undefined });
    renderGrid();
    expect(screen.getByTestId("screening-providers-error")).toBeInTheDocument();
  });

  it("fetches the redirect URL and opens it on provider selection", async () => {
    getProvidersMock.mockReturnValue({ isLoading: false, isError: false, data: MOCK_PROVIDERS });
    triggerRedirectMock.mockReturnValue({
      unwrap: () => Promise.resolve({ redirect_url: "https://kc.example/host", provider: "keycheck" }),
    });
    const openWindow = vi.fn();
    renderGrid(openWindow);

    await userEvent.click(screen.getByTestId("screening-provider-select-keycheck"));
    await waitFor(() => {
      expect(triggerRedirectMock).toHaveBeenCalledWith(
        expect.objectContaining({ applicantId: "app-1", provider: "keycheck" }),
      );
      expect(openWindow).toHaveBeenCalledWith("https://kc.example/host");
    });
  });

  it("shows an error toast when the redirect fetch fails", async () => {
    getProvidersMock.mockReturnValue({ isLoading: false, isError: false, data: MOCK_PROVIDERS });
    triggerRedirectMock.mockReturnValue({
      unwrap: () => Promise.reject(new Error("network error")),
    });
    renderGrid();

    await userEvent.click(screen.getByTestId("screening-provider-select-rentspree"));
    await waitFor(() => {
      expect(showErrorMock).toHaveBeenCalled();
    });
  });
});
