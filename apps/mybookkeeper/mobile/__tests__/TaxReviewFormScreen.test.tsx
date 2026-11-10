import type { FormCompleteness } from "@mybookkeeper/api-client/types/tax/FormCompleteness";
import type { TaxCompletenessResponse } from "@mybookkeeper/api-client/types/tax/TaxCompletenessResponse";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { act, render, screen } from "@testing-library/react-native";
import type { AxiosAdapter, AxiosRequestConfig } from "axios";
import { Provider } from "react-redux";
import { SHOWING_LAST_LOADED_MESSAGE } from "@platform/mobile";
import { TAX_REVIEW_MESSAGES as MESSAGES } from "../src/constants/taxReview";
import TaxReviewFormScreen from "../src/features/tax/TaxReviewFormScreen";
import { store } from "../src/lib/store";

jest.mock("expo-router", () => ({ useFocusEffect: () => undefined, router: { push: jest.fn() } }));

const originalAdapter = api.defaults.adapter;

const FORM: FormCompleteness = {
  form_name: "schedule_e",
  instance_label: "123 Main St",
  filled_fields: ["Rents received", "Insurance"],
  missing_fields: ["Mortgage interest"],
  total_expected: 3,
  total_filled: 2,
  highlights: ["Rental income found for 123 Main St."],
};

interface Server {
  review: TaxCompletenessResponse;
  status?: number;
  hanging?: boolean;
}

function serve(forms: FormCompleteness[] = [FORM]): Server {
  const server: Server = { review: { tax_year: 2025, tax_return_id: "r1", needs_recompute: false, forms, summary: "s" } };
  const adapter: AxiosAdapter = async (config: AxiosRequestConfig) => {
    if (server.hanging) return new Promise(() => undefined);
    const answer = { data: server.review, status: server.status ?? 200, statusText: "", headers: {}, config } as never;
    if (server.status) throw Object.assign(new Error("refused"), { isAxiosError: true, response: answer, config });
    return answer;
  };
  api.defaults.adapter = adapter;
  return server;
}

async function show(instance = "123 Main St", copy = 0): Promise<void> {
  await render(
    <Provider store={store}>
      <TaxReviewFormScreen formName="schedule_e" copy={copy} instance={instance} year={2025} />
    </Provider>,
  );
}

beforeEach(() => {
  store.dispatch(baseApi.util.resetApiState());
});

afterAll(() => {
  api.defaults.adapter = originalAdapter;
});

describe("TaxReviewFormScreen", () => {
  it("lists what was found and what wasn't, with the progress and highlights", async () => {
    serve();
    await show();
    expect(await screen.findByText("Schedule E · 123 Main St")).toBeTruthy();
    expect(screen.getByText(`${MESSAGES.found} (2)`)).toBeTruthy();
    expect(screen.getByText("Rents received")).toBeTruthy();
    expect(screen.getByText(`${MESSAGES.notFound} (1)`)).toBeTruthy();
    expect(screen.getByText("Mortgage interest")).toBeTruthy();
    expect(screen.getByText(`In progress · ${MESSAGES.filled(2, 3)}`)).toBeTruthy();
    expect(screen.getByText("Rental income found for 123 Main St.")).toBeTruthy();
  });

  it("opens the copy that was asked for when a return has several of the form", async () => {
    serve([FORM, { ...FORM, instance_label: "9 Oak Ave", filled_fields: ["Other"] }]);
    await show("9 Oak Ave");
    expect(await screen.findByText("Other")).toBeTruthy();
    expect(screen.queryByText("Rents received")).toBeNull();
  });

  it("tells two unlabeled copies apart by which copy was opened", async () => {
    const unlabeled = { ...FORM, form_name: "w2", instance_label: null };
    serve([{ ...unlabeled, filled_fields: ["First wages"] }, { ...unlabeled, filled_fields: ["Second wages"] }]);
    await render(
      <Provider store={store}>
        <TaxReviewFormScreen copy={1} formName="w2" instance="" year={2025} />
      </Provider>,
    );
    expect(await screen.findByText("Second wages")).toBeTruthy();
    expect(screen.queryByText("First wages")).toBeNull();
  });

  it("says a form with no fields at all has none, not that it is complete", async () => {
    serve([{ ...FORM, filled_fields: [], missing_fields: [], total_filled: 0, total_expected: 0, highlights: [] }]);
    await show();
    expect(await screen.findByText(MESSAGES.nothingFound)).toBeTruthy();
  });

  it("shows a skeleton while loading, not an empty form", async () => {
    serve().hanging = true;
    await show();
    expect(await screen.findByTestId("tax-review-skeleton")).toBeTruthy();
    expect(screen.queryByText(MESSAGES.nothingFound)).toBeNull();
  });

  it("tells a form that is gone from a review that failed to load", async () => {
    serve([]);
    await show();
    expect(await screen.findByText(MESSAGES.couldntFindForm)).toBeTruthy();
    expect(screen.queryByText(MESSAGES.tryAgain)).toBeNull();
  });

  it("offers a retry when the review fails to load", async () => {
    serve().status = 500;
    await show();
    expect(await screen.findByText(MESSAGES.couldntLoad(2025))).toBeTruthy();
    expect(screen.getByText(MESSAGES.tryAgain)).toBeTruthy();
  });

  it("keeps showing the form when a refresh fails, and says it's old", async () => {
    const server = serve();
    await show();
    await screen.findByText("Rents received");
    server.status = 500;
    const { refreshControl } = screen.getByTestId("tax-review-form").props;
    await act(async () => {
      await refreshControl.props.onRefresh();
    });
    expect(await screen.findByText(SHOWING_LAST_LOADED_MESSAGE)).toBeTruthy();
    expect(screen.getByText("Rents received")).toBeTruthy();
  });
});
