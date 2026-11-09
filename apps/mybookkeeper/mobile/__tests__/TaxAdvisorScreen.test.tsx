import { TAX_ADVISOR_CTA_MESSAGES } from "@mybookkeeper/api-client/constants/taxAdvisor";
import { formatAdvisorGeneratedAt } from "@mybookkeeper/api-client/utils/formatAdvisorGeneratedAt";
import type { TaxAdvisorCachedResponse } from "@mybookkeeper/api-client/types/tax/TaxAdvisorCachedResponse";
import type { TaxAdvisorSuggestionRead } from "@mybookkeeper/api-client/types/tax/TaxAdvisorSuggestionRead";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Provider } from "react-redux";
import { TAX_ADVISOR_MESSAGES as MESSAGES } from "../src/constants/taxAdvisor";
import TaxAdvisorScreen from "../src/features/taxReturns/TaxAdvisorScreen";
import { useIsAdmin } from "../src/features/workspace/useIsAdmin";
import { store } from "../src/lib/store";
import { startTaxServer, type TaxCall, writesOnly } from "../test-support/taxReturnsServer";

jest.mock("expo-router", () => ({ useFocusEffect: () => undefined, router: { push: jest.fn() } }));
jest.mock("../src/features/workspace/useIsAdmin", () => ({ useIsAdmin: jest.fn() }));

const originalAdapter = api.defaults.adapter;

function aSuggestion(overrides: Partial<TaxAdvisorSuggestionRead> = {}): TaxAdvisorSuggestionRead {
  return {
    id: "s1", db_id: "a", status: "active", severity: "high", category: "c", title: "Claim the home office", description: "You work from home.",
    estimated_savings: 1500, action: "Add Form 8829.", irs_reference: "Pub 587", confidence: "medium", affected_properties: ["Elm St"],
    affected_form: "schedule_c", status_changed_at: null, generation_id: "g", ...overrides,
  };
}

function advice(suggestions: TaxAdvisorSuggestionRead[]): TaxAdvisorCachedResponse {
  return { suggestions, disclaimer: "Not tax advice.", generated_at: "2026-03-10T12:00:00Z", model_version: "m" };
}

interface World {
  cached: TaxAdvisorCachedResponse | null;
  forms: { form_name: string; instance_count: number; field_count: number }[];
  generate: { status?: number; data?: TaxAdvisorCachedResponse };
  status: number;
  gate?: Promise<void>;
}

function serve(over: Partial<World> = {}) {
  const world: World = {
    cached: null,
    forms: [{ form_name: "schedule_e", instance_count: 1, field_count: 5 }],
    generate: {},
    status: 200,
    ...over,
  };
  const server = startTaxServer(async (call: TaxCall) => {
    if (call.url.endsWith("/forms-overview")) return { data: world.forms };
    if (call.url.endsWith("/validation")) return { data: [] };
    if (call.url.endsWith("/advisor/generate")) {
      await world.gate;
      if (world.generate.status) return { status: world.generate.status };
      world.cached = world.generate.data ?? advice([aSuggestion()]);
      return { data: world.cached };
    }
    if (call.method === "patch") {
      if (world.status !== 200) return { status: world.status };
      const id = call.url.split("/").pop();
      const { status } = call.data as { status: TaxAdvisorSuggestionRead["status"] };
      world.cached = world.cached && advice(world.cached.suggestions.map((item) => (item.db_id === id ? { ...item, status } : item)));
      return {};
    }
    return world.cached ? { data: world.cached } : { status: 404 };
  });
  return { world, calls: server.calls };
}

async function show(): Promise<void> {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>
        <TaxAdvisorScreen returnId="r1" />
      </ToastProvider>
    </Provider>,
  );
}

beforeEach(() => {
  store.dispatch(baseApi.util.resetApiState());
  jest.clearAllMocks();
  jest.mocked(useIsAdmin).mockReturnValue(true);
});

afterAll(() => {
  api.defaults.adapter = originalAdapter;
});

describe("TaxAdvisorScreen", () => {
  it("invites an admin to ask for advice when there is none yet, then shows it", async () => {
    const { calls } = serve();
    await show();
    await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.getAdvice }));
    expect(await screen.findByText("Claim the home office")).toBeTruthy();
    expect(calls.filter((call) => call.url.endsWith("/advisor/generate"))).toHaveLength(1);
    expect(screen.getByText(MESSAGES.priority("High", 1))).toBeTruthy();
    expect(screen.getByText(MESSAGES.savings("$1,500.00"))).toBeTruthy();
    expect(screen.getByText("Pub 587 · schedule_c · Elm St")).toBeTruthy();
    expect(screen.getByText("Not tax advice.")).toBeTruthy();
    expect(screen.getByText(MESSAGES.generatedOn(formatAdvisorGeneratedAt("2026-03-10T12:00:00Z")))).toBeTruthy();
  });

  it("shows the review in progress, and asks only once on a double press", async () => {
    let answer = (): void => undefined;
    const { calls } = serve({ gate: new Promise<void>((resolve) => (answer = resolve)) });
    await show();
    const ask = await screen.findByRole("button", { name: MESSAGES.getAdvice });
    await fireEvent.press(ask);
    await fireEvent.press(ask);
    expect(await screen.findByLabelText(MESSAGES.reviewing)).toBeTruthy();
    answer();
    await screen.findByText("Claim the home office");
    expect(calls.filter((call) => call.url.endsWith("/advisor/generate"))).toHaveLength(1);
  });

  it("says when today's limit was hit and offers nothing to press", async () => {
    serve({ generate: { status: 429 } });
    await show();
    await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.getAdvice }));
    expect(await screen.findByText(TAX_ADVISOR_CTA_MESSAGES["rate-limited"])).toBeTruthy();
    expect(screen.queryByRole("button", { name: MESSAGES.getAdvice })).toBeNull();
  });

  it("says the demo workspace can't ask, with its own message and nothing to press", async () => {
    serve({ generate: { status: 403 } });
    await show();
    await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.getAdvice }));
    expect(await screen.findByText(TAX_ADVISOR_CTA_MESSAGES.demo)).toBeTruthy();
    expect(screen.queryByText(TAX_ADVISOR_CTA_MESSAGES.error)).toBeNull();
    expect(screen.queryByRole("button", { name: MESSAGES.getAdvice })).toBeNull();
  });

  it("shows the advice just written, never the first-ask prompt, while the refetch is still on its way", async () => {
    const { world } = serve();
    await show();
    await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.getAdvice }));
    expect(await screen.findByText("Claim the home office")).toBeTruthy();
    expect(screen.queryByText(TAX_ADVISOR_CTA_MESSAGES.idle)).toBeNull();
    expect(world.cached).not.toBeNull();
  });

  it("says it ran into a problem on any other failure, and lets me try again", async () => {
    const { world } = serve({ generate: { status: 500 } });
    await show();
    await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.getAdvice }));
    expect(await screen.findByText(TAX_ADVISOR_CTA_MESSAGES.error)).toBeTruthy();
    world.generate = {};
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.getAdvice }));
    expect(await screen.findByText("Claim the home office")).toBeTruthy();
  });

  it("tells a viewer only admins can ask, with no button", async () => {
    jest.mocked(useIsAdmin).mockReturnValue(false);
    serve();
    await show();
    expect(await screen.findByText(MESSAGES.adminsOnly)).toBeTruthy();
    expect(screen.queryByRole("button", { name: MESSAGES.getAdvice })).toBeNull();
  });

  it("groups advice high to low, leaves dismissed advice out and shrinks resolved advice to a line", async () => {
    serve({
      cached: advice([
        aSuggestion({ db_id: "low", severity: "low", title: "Low one" }),
        aSuggestion({ db_id: "hi", title: "High one" }),
        aSuggestion({ db_id: "gone", title: "Dismissed one", status: "dismissed" }),
        aSuggestion({ db_id: "done", severity: "medium", title: "Done one", status: "resolved" }),
      ]),
    });
    await show();
    expect(await screen.findByText("High one")).toBeTruthy();
    expect(screen.queryByText("Dismissed one")).toBeNull();
    expect(screen.getByText(MESSAGES.resolvedLine("Done one"))).toBeTruthy();
    expect(screen.getAllByRole("button", { name: MESSAGES.markResolved })).toHaveLength(2);
    expect(screen.getAllByRole("header").map((node) => node.props.children)).toEqual(
      expect.arrayContaining([MESSAGES.priority("High", 1), MESSAGES.priority("Medium", 1), MESSAGES.priority("Low", 1)]),
    );
  });

  it("marks advice resolved and dismissed with the right status", async () => {
    const { calls } = serve({ cached: advice([aSuggestion(), aSuggestion({ db_id: "b", title: "Second" })]) });
    await show();
    await screen.findByText("Claim the home office");
    await fireEvent.press(screen.getAllByRole("button", { name: MESSAGES.markResolved })[0]);
    await waitFor(() => expect(screen.getByText(MESSAGES.resolvedLine("Claim the home office"))).toBeTruthy());
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.dismiss }));
    await waitFor(() => expect(screen.queryByText("Second")).toBeNull());
    expect(writesOnly(calls).map((call) => [call.url, call.data])).toEqual([
      ["/tax-returns/r1/advisor/a", { status: "resolved" }],
      ["/tax-returns/r1/advisor/b", { status: "dismissed" }],
    ]);
  });

  it("says it couldn't update advice and keeps it on screen", async () => {
    serve({ cached: advice([aSuggestion()]), status: 500 });
    await show();
    await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.dismiss }));
    expect(await screen.findByText(MESSAGES.couldntUpdate)).toBeTruthy();
    expect(screen.getByText("Claim the home office")).toBeTruthy();
  });

  it("gives a viewer the advice with no way to change it", async () => {
    jest.mocked(useIsAdmin).mockReturnValue(false);
    serve({ cached: advice([aSuggestion()]) });
    await show();
    await screen.findByText("Claim the home office");
    expect(screen.queryByRole("button", { name: MESSAGES.markResolved })).toBeNull();
    expect(screen.queryByRole("button", { name: MESSAGES.dismiss })).toBeNull();
    expect(screen.queryByRole("button", { name: MESSAGES.regenerate })).toBeNull();
  });

  it("says all is well when the advisor found nothing, and offers a regenerate", async () => {
    serve({ cached: advice([]) });
    await show();
    expect(await screen.findByText(MESSAGES.allGoodHeading)).toBeTruthy();
    expect(screen.getByRole("button", { name: MESSAGES.regenerate })).toBeTruthy();
  });

  it("says when everything has been resolved or dismissed", async () => {
    serve({ cached: advice([aSuggestion({ status: "dismissed" })]) });
    await show();
    expect(await screen.findByText(MESSAGES.allDoneHeading)).toBeTruthy();
  });

  it("regenerates over what's on file", async () => {
    const { calls } = serve({ cached: advice([aSuggestion()]) });
    await show();
    await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.regenerate }));
    await waitFor(() => expect(calls.some((call) => call.url.endsWith("/advisor/generate"))).toBe(true));
  });

  it("has nothing to review on a return with no forms", async () => {
    serve({ forms: [] });
    await show();
    expect(await screen.findByText(MESSAGES.noFormsHeading)).toBeTruthy();
    expect(screen.queryByRole("button", { name: MESSAGES.getAdvice })).toBeNull();
  });

  it("offers a retry when the advice failed to load, instead of calling it none", async () => {
    startTaxServer((call) => {
      if (call.url.endsWith("/forms-overview")) return { data: [{ form_name: "schedule_e", instance_count: 1, field_count: 5 }] };
      if (call.url.endsWith("/validation")) return { data: [] };
      return { status: 500 };
    });
    await show();
    expect(await screen.findByText(MESSAGES.couldntLoad)).toBeTruthy();
    expect(screen.queryByRole("button", { name: MESSAGES.getAdvice })).toBeNull();
  });

  it("offers a retry when the forms failed to load, instead of calling the return empty", async () => {
    startTaxServer(() => ({ status: 500 }));
    await show();
    expect(await screen.findByText(MESSAGES.couldntLoadForms)).toBeTruthy();
    expect(screen.queryByText(MESSAGES.noFormsHeading)).toBeNull();
  });

  it("shows a skeleton while loading", async () => {
    api.defaults.adapter = () => new Promise(() => undefined);
    await show();
    expect(await screen.findByTestId("tax-advisor-skeleton")).toBeTruthy();
  });
});
