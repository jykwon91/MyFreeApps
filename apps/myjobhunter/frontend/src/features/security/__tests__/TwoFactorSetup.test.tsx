import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { baseApi } from "@platform/ui";
import TwoFactorSetup from "@/features/security/TwoFactorSetup";

// Stub the QR component so jsdom doesn't have to render an SVG.
vi.mock("qrcode.react", () => ({
  QRCodeSVG: ({ value }: { value: string }) => (
    <img data-testid="qr-code" alt={`QR code for ${value}`} />
  ),
}));

// Hoisted mocks — must be referenceable from inside ``vi.mock`` factories,
// which Vitest hoists above all imports.
const { mockShowSuccess, mockSetupTotp, mockVerifyTotp, mockDisableTotp } =
  vi.hoisted(() => ({
    mockShowSuccess: vi.fn(),
    mockSetupTotp: vi.fn(),
    mockVerifyTotp: vi.fn(),
    mockDisableTotp: vi.fn(),
  }));

// Stub the toast lib (resolved through @platform/ui) so we can assert on it.
vi.mock("@platform/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@platform/ui")>();
  return {
    ...actual,
    showSuccess: mockShowSuccess,
    showError: vi.fn(),
  };
});

vi.mock("@/store/totpApi", () => ({
  useGetTotpStatusQuery: vi.fn(),
  useSetupTotpMutation: vi.fn(() => [mockSetupTotp, { isLoading: false }]),
  useVerifyTotpMutation: vi.fn(() => [mockVerifyTotp, { isLoading: false }]),
  useDisableTotpMutation: vi.fn(() => [mockDisableTotp, { isLoading: false }]),
}));

import {
  useGetTotpStatusQuery,
  useSetupTotpMutation,
  useVerifyTotpMutation,
  useDisableTotpMutation,
} from "@/store/totpApi";

function renderComponent() {
  // A minimal store that wires the baseApi reducer; the component never
  // actually dispatches against it (mutations are mocked) but the Provider
  // is required for the RTK Query hooks to mount without throwing.
  const store = configureStore({
    reducer: { [baseApi.reducerPath]: baseApi.reducer },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(baseApi.middleware),
  });
  return render(
    <Provider store={store}>
      <TwoFactorSetup />
    </Provider>,
  );
}

// ---------------------------------------------------------------------------
// Initial load
// ---------------------------------------------------------------------------

describe("TwoFactorSetup — initial load", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows skeleton while status is loading", () => {
    vi.mocked(useGetTotpStatusQuery).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as unknown as ReturnType<typeof useGetTotpStatusQuery>);

    const { container } = renderComponent();
    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
    expect(screen.queryByText("Enable 2FA")).not.toBeInTheDocument();
  });

  it("shows Enable 2FA when 2FA is disabled", () => {
    vi.mocked(useGetTotpStatusQuery).mockReturnValue({
      data: { enabled: false },
      isLoading: false,
    } as unknown as ReturnType<typeof useGetTotpStatusQuery>);

    renderComponent();
    expect(screen.getByText("Enable 2FA")).toBeInTheDocument();
  });

  it("shows Disable 2FA when 2FA is already enabled", () => {
    vi.mocked(useGetTotpStatusQuery).mockReturnValue({
      data: { enabled: true },
      isLoading: false,
    } as unknown as ReturnType<typeof useGetTotpStatusQuery>);

    renderComponent();
    expect(screen.getByText("Disable 2FA")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Setup → verify → recovery happy path
// ---------------------------------------------------------------------------

describe("TwoFactorSetup — enrollment flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useGetTotpStatusQuery).mockReturnValue({
      data: { enabled: false },
      isLoading: false,
    } as unknown as ReturnType<typeof useGetTotpStatusQuery>);
    vi.mocked(useSetupTotpMutation).mockReturnValue([
      mockSetupTotp,
      { isLoading: false },
    ] as unknown as ReturnType<typeof useSetupTotpMutation>);
    vi.mocked(useVerifyTotpMutation).mockReturnValue([
      mockVerifyTotp,
      { isLoading: false },
    ] as unknown as ReturnType<typeof useVerifyTotpMutation>);
  });

  it("clicking Enable 2FA calls the setup mutation and renders QR + secret", async () => {
    const user = userEvent.setup();
    mockSetupTotp.mockReturnValue({
      unwrap: () =>
        Promise.resolve({
          secret: "MYSECRET123",
          provisioning_uri: "otpauth://totp/test?secret=MYSECRET123",
          recovery_codes: ["AAAA1111", "BBBB2222"],
        }),
    });

    renderComponent();
    await user.click(screen.getByText("Enable 2FA"));

    await screen.findByTestId("qr-code");
    expect(screen.getByText("MYSECRET123")).toBeInTheDocument();
    expect(
      screen.getByText("Enter the 6-digit code from your app"),
    ).toBeInTheDocument();
  });

  it("verifying with a 6-digit code transitions to the recovery-codes view", async () => {
    const user = userEvent.setup();
    mockSetupTotp.mockReturnValue({
      unwrap: () =>
        Promise.resolve({
          secret: "ABCDEF",
          provisioning_uri: "otpauth://totp/test",
          recovery_codes: ["CODE0001", "CODE0002", "CODE0003"],
        }),
    });
    mockVerifyTotp.mockReturnValue({
      unwrap: () => Promise.resolve({ verified: true }),
    });

    renderComponent();
    await user.click(screen.getByText("Enable 2FA"));
    await screen.findByPlaceholderText("000000");
    await user.type(screen.getByPlaceholderText("000000"), "654321");
    await user.click(screen.getByText("Verify & Enable"));

    await screen.findByText("CODE0001");
    expect(screen.getByText("CODE0002")).toBeInTheDocument();
    expect(screen.getByText("CODE0003")).toBeInTheDocument();
    expect(screen.getByText("Save your recovery codes")).toBeInTheDocument();

    await waitFor(() => {
      expect(mockShowSuccess).toHaveBeenCalledWith("2FA enabled successfully");
    });
  });

  it("Verify & Enable button is disabled until 6 digits are entered", async () => {
    const user = userEvent.setup();
    mockSetupTotp.mockReturnValue({
      unwrap: () =>
        Promise.resolve({
          secret: "ABCDEF",
          provisioning_uri: "otpauth://totp/test",
          recovery_codes: ["X1", "X2"],
        }),
    });

    renderComponent();
    await user.click(screen.getByText("Enable 2FA"));
    await screen.findByPlaceholderText("000000");

    const verifyButton = screen.getByText("Verify & Enable").closest("button")!;
    expect(verifyButton).toBeDisabled();

    await user.type(screen.getByPlaceholderText("000000"), "12345");
    expect(verifyButton).toBeDisabled();

    await user.type(screen.getByPlaceholderText("000000"), "6");
    expect(verifyButton).not.toBeDisabled();
  });

  it("only allows digits in the verify code input", async () => {
    const user = userEvent.setup();
    mockSetupTotp.mockReturnValue({
      unwrap: () =>
        Promise.resolve({
          secret: "ABC",
          provisioning_uri: "otpauth://totp/test",
          recovery_codes: ["A1"],
        }),
    });

    renderComponent();
    await user.click(screen.getByText("Enable 2FA"));
    await screen.findByPlaceholderText("000000");
    const input = screen.getByPlaceholderText("000000");

    await user.type(input, "12abc34");
    expect(input).toHaveValue("1234");

    await user.type(input, "5678");
    expect(input).toHaveValue("123456");
  });

  it("surfaces an error if verify fails with a wrong code", async () => {
    const user = userEvent.setup();
    mockSetupTotp.mockReturnValue({
      unwrap: () =>
        Promise.resolve({
          secret: "X",
          provisioning_uri: "otpauth://totp/test",
          recovery_codes: ["a"],
        }),
    });
    mockVerifyTotp.mockReturnValue({
      unwrap: () => Promise.reject(new Error("Invalid TOTP code")),
    });

    renderComponent();
    await user.click(screen.getByText("Enable 2FA"));
    await screen.findByPlaceholderText("000000");
    await user.type(screen.getByPlaceholderText("000000"), "000000");
    await user.click(screen.getByText("Verify & Enable"));

    await screen.findByText("Invalid TOTP code");
  });
});

// ---------------------------------------------------------------------------
// Disable flow
// ---------------------------------------------------------------------------

describe("TwoFactorSetup — disable flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useGetTotpStatusQuery).mockReturnValue({
      data: { enabled: true },
      isLoading: false,
    } as unknown as ReturnType<typeof useGetTotpStatusQuery>);
    vi.mocked(useDisableTotpMutation).mockReturnValue([
      mockDisableTotp,
      { isLoading: false },
    ] as unknown as ReturnType<typeof useDisableTotpMutation>);
  });

  it("clicking Disable 2FA reveals the authenticator code input", async () => {
    const user = userEvent.setup();
    renderComponent();
    await user.click(screen.getByText("Disable 2FA"));

    expect(
      screen.getByText("Enter a code from your authenticator app to disable 2FA."),
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText("000000")).toBeInTheDocument();
  });

  it("submits the typed code to the disable mutation and fires success toast", async () => {
    const user = userEvent.setup();
    mockDisableTotp.mockReturnValue({ unwrap: () => Promise.resolve() });

    renderComponent();
    await user.click(screen.getByText("Disable 2FA"));
    await user.type(screen.getByPlaceholderText("000000"), "654321");

    const allDisableButtons = screen.getAllByRole("button", {
      name: /Disable 2FA/i,
    });
    await user.click(allDisableButtons[allDisableButtons.length - 1]);

    await waitFor(() => {
      expect(mockDisableTotp).toHaveBeenCalledWith({ code: "654321" });
    });
    await waitFor(() => {
      expect(mockShowSuccess).toHaveBeenCalledWith("2FA has been disabled");
    });
  });

  it("Cancel returns to status without calling the mutation", async () => {
    const user = userEvent.setup();
    renderComponent();
    await user.click(screen.getByText("Disable 2FA"));
    await user.click(screen.getByText("Cancel"));

    expect(screen.queryByPlaceholderText("000000")).not.toBeInTheDocument();
    expect(mockDisableTotp).not.toHaveBeenCalled();
  });
});
