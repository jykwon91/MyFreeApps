import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { store } from "@/shared/store";

const triggerMock = vi.fn();

vi.mock("@/shared/store/screeningApi", () => ({
  useLazyGetScreeningRedirectQuery: () => [triggerMock, { isFetching: false }],
}));

const showErrorMock = vi.fn();
vi.mock("@/shared/lib/toast-store", () => ({
  showError: (m: string) => showErrorMock(m),
  showSuccess: vi.fn(),
}));

import RunScreeningButton from "@/app/features/screening/RunScreeningButton";

function renderButton(openWindow: ((url: string) => void) | undefined = vi.fn()) {
  const fn = openWindow ?? vi.fn();
  return {
    openWindow: fn,
    ...render(
      <Provider store={store}>
        <RunScreeningButton applicantId="app-1" openWindow={fn} />
      </Provider>,
    ),
  };
}

describe("RunScreeningButton", () => {
  beforeEach(() => {
    triggerMock.mockReset();
    showErrorMock.mockReset();
  });

  it("renders the Run KeyCheck label", () => {
    renderButton();
    expect(screen.getByTestId("run-screening-button")).toHaveTextContent(/Run KeyCheck/i);
  });

  it("fetches the redirect URL and opens it in a new tab on click", async () => {
    triggerMock.mockReturnValue({
      unwrap: () =>
        Promise.resolve({ redirect_url: "https://kc.example/host", provider: "keycheck" }),
    });
    const { openWindow } = renderButton();
    await userEvent.click(screen.getByTestId("run-screening-button"));
    await waitFor(() => {
      expect(triggerMock).toHaveBeenCalledWith("app-1");
      expect(openWindow).toHaveBeenCalledWith("https://kc.example/host");
    });
  });

  it("shows an error toast when the redirect fetch fails", async () => {
    triggerMock.mockReturnValue({
      unwrap: () => Promise.reject(new Error("boom")),
    });
    renderButton();
    await userEvent.click(screen.getByTestId("run-screening-button"));
    await waitFor(() => {
      expect(showErrorMock).toHaveBeenCalled();
    });
  });
});
