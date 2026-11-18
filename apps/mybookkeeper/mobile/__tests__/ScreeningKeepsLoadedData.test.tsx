import { useGetScreeningEligibilityQuery, useGetScreeningProvidersQuery, useLazyGetScreeningRedirectQuery } from "@mybookkeeper/api-client/store/screeningApi";
import { ToastProvider } from "@platform/mobile";
import { render, screen } from "@testing-library/react-native";
import { SCREENING_MESSAGES } from "../src/constants/applicantScreening";
import ScreeningActions from "../src/features/applicants/ScreeningActions";
import ScreeningProviders from "../src/features/applicants/ScreeningProviders";

jest.mock("@mybookkeeper/api-client/store/screeningApi", () => ({
  useGetScreeningEligibilityQuery: jest.fn(),
  useGetScreeningProvidersQuery: jest.fn(),
  useLazyGetScreeningRedirectQuery: jest.fn(),
}));
jest.mock("expo-web-browser", () => ({ openBrowserAsync: jest.fn() }));

const FAILED_REFRESH = { status: "FETCH_ERROR" };
const PROVIDERS = {
  providers: [{ name: "keycheck", label: "KeyCheck", description: "Credit check", cost_label: "$30", turnaround_label: "Same day", external_url: "https://example.com" }],
};

beforeEach(() => {
  jest.mocked(useLazyGetScreeningRedirectQuery).mockReturnValue([jest.fn()] as never);
});

describe("Screening when a refresh fails after the details already loaded", () => {
  it("keeps the providers I already loaded", async () => {
    jest.mocked(useGetScreeningProvidersQuery).mockReturnValue({ data: PROVIDERS, error: FAILED_REFRESH, isLoading: false, refetch: jest.fn() } as never);
    await render(<ToastProvider bottomOffset={0}><ScreeningProviders applicantId="a1" /></ToastProvider>);

    expect(screen.getByText("KeyCheck")).toBeTruthy();
    expect(screen.queryByText(SCREENING_MESSAGES.couldntLoadProviders)).toBeNull();
  });

  it("keeps the upload option and providers instead of replacing them with an error", async () => {
    jest.mocked(useGetScreeningEligibilityQuery).mockReturnValue({ data: { eligible: true, has_pending: false, missing_fields: [] }, error: FAILED_REFRESH, isLoading: false, refetch: jest.fn() } as never);
    jest.mocked(useGetScreeningProvidersQuery).mockReturnValue({ data: PROVIDERS, isLoading: false, refetch: jest.fn() } as never);
    await render(<ToastProvider bottomOffset={0}><ScreeningActions applicantId="a1" hasPending={false} hasResults={false} onUpload={jest.fn()} /></ToastProvider>);

    expect(screen.getByText(SCREENING_MESSAGES.upload)).toBeTruthy();
    expect(screen.getByText("KeyCheck")).toBeTruthy();
  });

  it("shows the error and a retry when nothing ever loaded", async () => {
    jest.mocked(useGetScreeningEligibilityQuery).mockReturnValue({ data: undefined, error: FAILED_REFRESH, isLoading: false, refetch: jest.fn() } as never);
    await render(<ToastProvider bottomOffset={0}><ScreeningActions applicantId="a1" hasPending={false} hasResults={false} onUpload={jest.fn()} /></ToastProvider>);

    expect(screen.getByText(SCREENING_MESSAGES.tryAgain)).toBeTruthy();
  });
});
