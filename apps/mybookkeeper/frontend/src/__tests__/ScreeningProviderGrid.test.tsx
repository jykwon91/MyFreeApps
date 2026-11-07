import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { store } from "@/shared/store";

const getProvidersMock = vi.fn();
const triggerRedirectMock = vi.fn();

vi.mock("@mybookkeeper/api-client/store/screeningApi", () => ({
  useGetScreeningProvidersQuery: () => getProvidersMock(),
  useLazyGetScreeningRedirectQuery: () => [triggerRedirectMock, {}],
}));

const showErrorMock = vi.fn();
vi.mock("@platform/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@platform/ui")>()),
  showError: (m: string) => showErrorMock(m),
  showSuccess: vi.fn(),
}));

import ScreeningProviderGrid from "@/app/features/screening/ScreeningProviderGrid";
import { queryData } from "@/test/rtk-query-data";
import { queryStatus } from "@/test/rtk-query-status";
import type { QueryStatusOptions } from "@/test/types/query-status-options";

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

const refetchMock = vi.fn();

function providersState(
  providers: typeof MOCK_PROVIDERS | undefined,
  status: QueryStatusOptions = { failed: false, fetching: false },
) {
  return {
    ...queryData(providers),
    isLoading: providers === undefined && status.fetching && !status.failed,
    ...queryStatus(status),
    refetch: refetchMock,
  };
}

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
    refetchMock.mockReset();
  });

  it("shows a skeleton while providers are loading", () => {
    getProvidersMock.mockReturnValue(providersState(undefined, { failed: false, fetching: true }));
    renderGrid();
    expect(screen.getByTestId("screening-provider-grid-skeleton")).toBeInTheDocument();
  });

  it("renders both provider cards when loaded", () => {
    getProvidersMock.mockReturnValue(providersState(MOCK_PROVIDERS));
    renderGrid();
    expect(screen.getByTestId("screening-provider-card-keycheck")).toBeInTheDocument();
    expect(screen.getByTestId("screening-provider-card-rentspree")).toBeInTheDocument();
  });

  it("shows provider label, cost, and turnaround on each card", () => {
    getProvidersMock.mockReturnValue(providersState(MOCK_PROVIDERS));
    renderGrid();
    expect(screen.getByText("KeyCheck")).toBeInTheDocument();
    expect(screen.getByText("Free")).toBeInTheDocument();
    expect(screen.getByText("Usually 1–2 days")).toBeInTheDocument();
    expect(screen.getByText("RentSpree")).toBeInTheDocument();
    expect(screen.getByText("Paid by applicant")).toBeInTheDocument();
  });

  it("shows an error message when providers fail to load", () => {
    getProvidersMock.mockReturnValue(providersState(undefined, { failed: true, fetching: false }));
    renderGrid();
    expect(screen.getByTestId("screening-providers-error")).toBeInTheDocument();
  });

  it("retries the provider load when Retry is clicked", async () => {
    getProvidersMock.mockReturnValue(providersState(undefined, { failed: true, fetching: false }));
    renderGrid();
    await userEvent.setup().click(screen.getByTestId("screening-providers-retry"));
    expect(refetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps the error, not a skeleton, while Retry refetches", () => {
    getProvidersMock.mockReturnValue(providersState(undefined, { failed: true, fetching: true }));
    renderGrid();
    expect(screen.getByTestId("screening-providers-error")).toBeInTheDocument();
    expect(screen.getByTestId("screening-providers-retry")).toBeDisabled();
    expect(screen.getByTestId("screening-providers-retry")).toHaveTextContent("Retrying...");
    expect(screen.queryByTestId("screening-provider-grid-skeleton")).not.toBeInTheDocument();
  });

  it("keeps the provider cards usable under the error when a refresh fails", () => {
    getProvidersMock.mockReturnValue(providersState(MOCK_PROVIDERS, { failed: true, fetching: false }));
    renderGrid();
    expect(screen.getByTestId("screening-providers-error")).toBeInTheDocument();
    expect(screen.getByText("KeyCheck")).toBeInTheDocument();
  });

  it("fetches the redirect URL and opens it on provider selection", async () => {
    getProvidersMock.mockReturnValue(providersState(MOCK_PROVIDERS));
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
    getProvidersMock.mockReturnValue(providersState(MOCK_PROVIDERS));
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
