import { taxCompletenessApi } from "@mybookkeeper/api-client/store/taxCompletenessApi";
import type { FormCompleteness } from "@mybookkeeper/api-client/types/tax/FormCompleteness";
import type { TaxCompletenessResponse } from "@mybookkeeper/api-client/types/tax/TaxCompletenessResponse";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { AxiosAdapter, AxiosRequestConfig } from "axios";
import { Provider } from "react-redux";
import { SHOWING_LAST_LOADED_MESSAGE } from "@platform/mobile";
import { TAX_REPORT_MESSAGES } from "../src/constants/taxReport";
import { TAX_REVIEW_MESSAGES as MESSAGES } from "../src/constants/taxReview";
import { reviewFormOrder, reviewFormTitle } from "../src/features/tax/taxReviewDisplay";
import TaxReviewScreen from "../src/features/tax/TaxReviewScreen";
import { useCanWrite } from "../src/features/workspace/useCanWrite";
import { store } from "../src/lib/store";
import { useToday } from "../src/lib/useToday";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useFocusEffect: () => undefined,
  router: { push: (path: string) => mockPush(path) },
}));
jest.mock("../src/features/workspace/useCanWrite", () => ({ useCanWrite: jest.fn() }));
jest.mock("../src/lib/useToday", () => ({ useToday: jest.fn() }));
jest.mock("react-native/Libraries/Modal/Modal", () => ({
  __esModule: true,
  default: ({ visible, children }: { visible: boolean; children: unknown }) => (visible ? children : null),
}));

const originalAdapter = api.defaults.adapter;

function aForm(overrides: Partial<FormCompleteness> = {}): FormCompleteness {
  return {
    form_name: "schedule_e",
    instance_label: "123 Main St",
    filled_fields: ["line_3"],
    missing_fields: ["line_12"],
    total_expected: 16,
    total_filled: 1,
    highlights: ["Rental income found for 123 Main St."],
    ...overrides,
  };
}

function aReview(overrides: Partial<TaxCompletenessResponse> = {}): TaxCompletenessResponse {
  return {
    tax_year: 2025,
    tax_return_id: "r1",
    needs_recompute: false,
    forms: [aForm()],
    summary: "I have 1 rental property.",
    ...overrides,
  };
}

interface Server {
  review: TaxCompletenessResponse;
  urls: string[];
  dead: boolean;
  status?: number;
  hangingUrl?: string;
}

function serve(review: TaxCompletenessResponse = aReview()): Server {
  const server: Server = { review, urls: [], dead: false };
  const adapter: AxiosAdapter = async (config: AxiosRequestConfig & { url?: string }) => {
    server.urls.push(config.url ?? "");
    if (config.url === server.hangingUrl) return new Promise(() => undefined);
    if (server.dead) throw Object.assign(new Error("Network Error"), { isAxiosError: true, config });
    const answer = { data: server.review, status: server.status ?? 200, statusText: "", headers: {}, config } as never;
    if (server.status) throw Object.assign(new Error("refused"), { isAxiosError: true, response: answer, config });
    return answer;
  };
  api.defaults.adapter = adapter;
  return server;
}

async function show(): Promise<void> {
  await render(
    <Provider store={store}>
      <TaxReviewScreen />
    </Provider>,
  );
}

async function pull(): Promise<void> {
  const { refreshControl } = screen.getByTestId("tax-review-list").props;
  await act(async () => {
    await refreshControl.props.onRefresh();
  });
}

beforeEach(() => {
  store.dispatch(baseApi.util.resetApiState());
  mockPush.mockReset();
  jest.mocked(useCanWrite).mockReturnValue(true);
  jest.mocked(useToday).mockReturnValue(new Date(2026, 10, 5));
});

afterAll(() => {
  api.defaults.adapter = originalAdapter;
});

describe("tax review display", () => {
  it("puts schedules first, properties by address, then forms in tax order", () => {
    const sorted = reviewFormOrder([
      aForm({ form_name: "1099_k", instance_label: "Airbnb" }),
      aForm({ form_name: "w2", instance_label: "Acme" }),
      aForm({ form_name: "schedule_c", instance_label: null }),
      aForm({ instance_label: "9 Oak Ave" }),
      aForm({ instance_label: "1 Elm St" }),
    ]);
    expect(sorted.map(reviewFormTitle)).toEqual([
      "Schedule E · 1 Elm St",
      "Schedule E · 9 Oak Ave",
      "Schedule C",
      "W-2 · Acme",
      "1099-K · Airbnb",
    ]);
  });
});

describe("reviewFormTitle", () => {
  it.each([
    ["1040", "FORM 1040", "Form 1040"],
    ["schedule_b", "SCHEDULE B", "Schedule B"],
    ["schedule_se", "Schedule SE", "Schedule SE"],
  ])("doesn't repeat a form's own name: %s", (form_name, instance_label, title) => {
    expect(reviewFormTitle(aForm({ form_name, instance_label }))).toBe(title);
  });
});

describe("TaxReviewScreen", () => {
  it("refreshes when a return is recalculated, or a document finishes reading", async () => {
    const server = serve();
    await show();
    await screen.findByText("Schedule E · 123 Main St");
    server.review = aReview({ needs_recompute: true });
    await act(async () => {
      store.dispatch(taxCompletenessApi.util.invalidateTags([{ type: "TaxReturn", id: "r1" }]));
    });
    expect(await screen.findByText(MESSAGES.outOfDate)).toBeTruthy();
    server.review = aReview();
    await act(async () => {
      store.dispatch(taxCompletenessApi.util.invalidateTags([{ type: "TaxReturn", id: "TAX_DOCS" }]));
    });
    await waitFor(() => expect(screen.queryByText(MESSAGES.outOfDate)).toBeNull());
  });

  it("shows a year that had no return once a document finishes reading", async () => {
    const server = serve();
    server.status = 404;
    await show();
    await screen.findByText(MESSAGES.noneHeading(2025));
    server.status = undefined;
    await act(async () => {
      store.dispatch(taxCompletenessApi.util.invalidateTags([{ type: "TaxReturn", id: "TAX_DOCS" }]));
    });
    expect(await screen.findByText("Schedule E · 123 Main St")).toBeTruthy();
  });

  it("opens on last year, since that's the one being filed", async () => {
    const server = serve();
    await show();
    await screen.findByText("Schedule E · 123 Main St");
    expect(server.urls).toEqual(["/tax-completeness/2025"]);
  });

  it("shows each form with its highlights, and how many there are", async () => {
    serve();
    await show();
    expect(await screen.findByText("Rental income found for 123 Main St.")).toBeTruthy();
    expect(screen.getByText(MESSAGES.formCount(1, 2025))).toBeTruthy();
    expect(screen.getByText(MESSAGES.note)).toBeTruthy();
  });

  it("doesn't claim anything about a form with no highlights", async () => {
    serve(aReview({ forms: [aForm({ form_name: "1099_k", instance_label: "Airbnb", highlights: [] })] }));
    await show();
    expect(await screen.findByText(MESSAGES.nothingToPointOut)).toBeTruthy();
  });

  it("shows the summary and how much of each form was found, but keeps raw field names for the form's own screen", async () => {
    serve();
    await show();
    await screen.findByText("Schedule E · 123 Main St");
    expect(screen.getByText("I have 1 rental property.")).toBeTruthy();
    expect(screen.getByText(`Needs attention \u00b7 ${MESSAGES.filled(1, 16)}`)).toBeTruthy();
    expect(screen.queryByText(/line_/)).toBeNull();
  });

  it("opens a form's details from its row", async () => {
    serve(aReview({ forms: [aForm({ instance_label: "9 Oak Ave & Co" })] }));
    await show();
    await fireEvent.press(await screen.findByLabelText(new RegExp(MESSAGES.filled(1, 16))));
    expect(mockPush).toHaveBeenLastCalledWith("/tax/review-form?year=2025&form=schedule_e&instance=9%20Oak%20Ave%20%26%20Co&copy=0");
  });

  it("leaves the summary off when there isn't one", async () => {
    serve(aReview({ summary: "" }));
    await show();
    await screen.findByText("Schedule E · 123 Main St");
    expect(screen.queryByText(MESSAGES.summaryTitle)).toBeNull();
  });

  it("opens the tax return, and sends adding a document to the camera", async () => {
    serve();
    await show();
    await fireEvent.press(await screen.findByText(MESSAGES.openReturn(2025)));
    expect(mockPush).toHaveBeenLastCalledWith("/tax-returns/r1");
    await fireEvent.press(screen.getByText(MESSAGES.addDocument));
    expect(mockPush).toHaveBeenLastCalledWith("/camera");
  });

  it("gives a viewer the review, but nothing to add", async () => {
    jest.mocked(useCanWrite).mockReturnValue(false);
    serve();
    await show();
    await screen.findByText("Schedule E · 123 Main St");
    expect(screen.getByText(MESSAGES.openReturn(2025))).toBeTruthy();
    expect(screen.queryByText(MESSAGES.addDocument)).toBeNull();
  });

  it("says when the numbers are out of date", async () => {
    serve(aReview({ needs_recompute: true }));
    await show();
    expect(await screen.findByText(MESSAGES.outOfDate)).toBeTruthy();
  });

  it("switching year shows the skeleton, never last year's forms", async () => {
    const server = serve();
    await show();
    await screen.findByText("Schedule E · 123 Main St");
    server.hangingUrl = "/tax-completeness/2024";
    await fireEvent.press(screen.getByLabelText(new RegExp(`^${TAX_REPORT_MESSAGES.year}`)));
    await fireEvent.press(await screen.findByText("2024"));
    expect(await screen.findByTestId("tax-review-skeleton")).toBeTruthy();
    expect(screen.queryByText("Schedule E · 123 Main St")).toBeNull();
    expect(server.urls).toContain("/tax-completeness/2024");
  });

  it("treats a year with no return as nothing yet, not a failure", async () => {
    const server = serve();
    server.status = 404;
    await show();
    expect(await screen.findByText(MESSAGES.noneHeading(2025))).toBeTruthy();
    expect(screen.queryByText(MESSAGES.couldntLoad(2025))).toBeNull();
    await fireEvent.press(screen.getByText(MESSAGES.addDocument));
    expect(mockPush).toHaveBeenCalledWith("/camera");
  });

  it("treats a return with no forms the same way", async () => {
    serve(aReview({ forms: [], needs_recompute: true }));
    await show();
    expect(await screen.findByText(MESSAGES.noneHeading(2025))).toBeTruthy();
    expect(screen.queryByText(MESSAGES.openReturn(2025))).toBeNull();
    expect(screen.queryByText(MESSAGES.outOfDate)).toBeNull();
  });

  it("gives a viewer nothing to add when it's empty", async () => {
    jest.mocked(useCanWrite).mockReturnValue(false);
    serve(aReview({ forms: [] }));
    await show();
    expect(await screen.findByText(MESSAGES.noneBodyViewer)).toBeTruthy();
    expect(screen.queryByText(MESSAGES.addDocument)).toBeNull();
  });

  it("says a dropped connection is a failure, not an empty year, and can retry", async () => {
    const server = serve();
    server.dead = true;
    await show();
    expect(await screen.findByText(MESSAGES.couldntLoad(2025))).toBeTruthy();
    expect(screen.getByText(MESSAGES.checkConnection)).toBeTruthy();
    expect(screen.queryByText(MESSAGES.noneHeading(2025))).toBeNull();
    server.dead = false;
    await fireEvent.press(screen.getByText(MESSAGES.tryAgain));
    expect(await screen.findByText("Schedule E · 123 Main St")).toBeTruthy();
  });

  it("doesn't blame the connection when the server answered with an error", async () => {
    const server = serve();
    server.status = 500;
    await show();
    expect(await screen.findByText(MESSAGES.tryAgainLater)).toBeTruthy();
    expect(screen.queryByText(MESSAGES.noneHeading(2025))).toBeNull();
  });

  it("keeps what it had, and says so, when a refresh fails", async () => {
    const server = serve();
    await show();
    await screen.findByText("Schedule E · 123 Main St");
    server.dead = true;
    await pull();
    await waitFor(() => expect(screen.getByText(SHOWING_LAST_LOADED_MESSAGE)).toBeTruthy());
    expect(screen.getByText("Schedule E · 123 Main St")).toBeTruthy();
  });

  it("drops what it had when the return turns out to be gone", async () => {
    const server = serve();
    await show();
    await screen.findByText("Schedule E · 123 Main St");
    server.status = 404;
    await pull();
    expect(await screen.findByText(MESSAGES.noneHeading(2025))).toBeTruthy();
    expect(screen.queryByText("Schedule E · 123 Main St")).toBeNull();
    expect(screen.queryByText(SHOWING_LAST_LOADED_MESSAGE)).toBeNull();
  });
});
