/**
 * Discover keeps what each paid call found in the store: results, reads and saves survive leaving
 * the page. A failed read stays open with Try again, View original and Back; a search that finds
 * nothing says so and keeps the suggestions; focus follows each step to its heading, and the
 * result count is announced.
 */
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { Provider } from "react-redux";
import { Link, RouterProvider, createMemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { baseApi } from "@platform/ui";
import {
  DISCOVERY_EMPTY_COPY,
  DISCOVERY_NO_RESULTS_COPY,
  DISCOVERY_SUGGESTIONS,
} from "@myrecipes/api-client/constants/discovery";
import type {
  DiscoveredDetail,
  DiscoveredRecipe,
  DiscoveryResults,
} from "@myrecipes/api-client/types/recipe/discovery";
import api from "@/lib/api";
import { makeStore, type AppStore } from "@/lib/store";
import Discover from "@/pages/Discover";

const FLAN: DiscoveredRecipe = {
  id: "flan-1",
  title: "Flan Napolitano",
  source_type: "website",
  site_name: "Serious Eats",
  url: "https://www.seriouseats.com/flan-napolitano",
  image_url: null,
  summary: "A cream-cheese-enriched flan.",
  why_notable: null,
  total_minutes: 90,
  difficulty: "medium",
};

const RESULTS: DiscoveryResults = { query: "flan", recipes: [FLAN] };

const DETAIL: DiscoveredDetail = {
  title: FLAN.title,
  source_type: "website",
  site_name: "Serious Eats",
  url: FLAN.url,
  image_url: null,
  summary: "A dense flan set in a water bath.",
  draft: {
    title: "Flan Napolitano",
    description: null,
    source: "Serious Eats",
    servings: null,
    prep_minutes: null,
    cook_minutes: null,
    ingredients: [{ name: "eggs", quantity: 5, unit: null, note: null }],
    steps: [{ instruction: "Bake in a water bath." }],
  },
  tips: [],
  community_notes: [],
  sources: [],
};

const READ_FAILED = { status: 422, data: { detail: "unreadable" } };
const CREATED_ID = "recipe-9";

type Answer = { status: number; data: unknown };

let searchAnswers: Answer[];
let readAnswers: Answer[];
const calls: string[] = [];
let store: AppStore;
const originalAdapter = api.defaults.adapter;

function next(answers: Answer[], fallback: Answer): Answer {
  return answers.shift() ?? fallback;
}

function answerFor(config: InternalAxiosRequestConfig): Answer {
  if (config.url === "/discovery/search") return next(searchAnswers, { status: 200, data: RESULTS });
  if (config.url === "/discovery/detail") return next(readAnswers, { status: 200, data: DETAIL });
  if (config.url === "/recipes" && config.method === "post") return { status: 201, data: { id: CREATED_ID } };
  return { status: 404, data: { detail: "Not found" } };
}

const adapter: AxiosAdapter = async (config) => {
  calls.push(`${config.method} ${config.url}`);
  const { status, data } = answerFor(config);
  if (status >= 400) throw Object.assign(new Error("failed"), { response: { status, data }, config, isAxiosError: true });
  return { status, data, statusText: "", headers: {}, config };
};

function renderDiscover() {
  const router = createMemoryRouter(
    [
      { path: "/discover", element: <Discover /> },
      { path: "/recipes/:id", element: <Link to="/discover">Back to Discover</Link> },
    ],
    { initialEntries: ["/discover"] },
  );
  return render(
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>,
  );
}

async function searchFor(query: string) {
  await userEvent.type(screen.getByLabelText("Dish to search the web for"), query);
  await userEvent.click(screen.getByRole("button", { name: "Search the web" }));
}

async function openFlan() {
  await searchFor("flan");
  await userEvent.click(await screen.findByRole("button", { name: new RegExp(FLAN.title) }));
}

const callsTo = (url: string) => calls.filter((call) => call.endsWith(url)).length;

beforeEach(() => {
  store = makeStore();
  searchAnswers = [];
  readAnswers = [];
  calls.length = 0;
  api.defaults.adapter = adapter;
});

afterEach(() => {
  act(() => {
    store.dispatch(baseApi.util.resetApiState());
  });
  api.defaults.adapter = originalAdapter;
});

describe("Discover", () => {
  it("keeps a failed read open with Try again, View original and Back to results", async () => {
    readAnswers = [READ_FAILED];
    renderDiscover();
    await openFlan();

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't read a recipe/i);
    expect(screen.getByRole("heading", { level: 1, name: FLAN.title })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    const original = screen.getByRole("link", { name: /View original/ });
    expect(original).toHaveAttribute("href", FLAN.url);
    expect(original).toHaveAttribute("target", "_blank");
    expect(original).toHaveAttribute("rel", "noopener noreferrer");

    await userEvent.click(screen.getByRole("button", { name: "Back to results" }));
    expect(await screen.findByRole("button", { name: new RegExp(FLAN.title) })).toBeInTheDocument();
  });

  it("reads the page again from Try again", async () => {
    readAnswers = [READ_FAILED];
    renderDiscover();
    await openFlan();

    await userEvent.click(await screen.findByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("button", { name: "Save to my recipes" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(callsTo("/discovery/detail")).toBe(2);
  });

  it("offers Back to results while a read is still running", async () => {
    readAnswers = [];
    let finishRead!: () => void;
    const held = new Promise<void>((resolve) => (finishRead = resolve));
    api.defaults.adapter = async (config) => {
      if (config.url === "/discovery/detail") await held;
      return adapter(config);
    };
    renderDiscover();
    await openFlan();

    await userEvent.click(await screen.findByRole("button", { name: "Back to results" }));
    expect(await screen.findByRole("button", { name: new RegExp(FLAN.title) })).toBeInTheDocument();

    await act(async () => finishRead());
    await userEvent.click(screen.getByRole("button", { name: new RegExp(FLAN.title) }));
    expect(await screen.findByRole("button", { name: "Save to my recipes" })).toBeInTheDocument();
    expect(callsTo("/discovery/detail")).toBe(1);
  });

  it("says nothing was found and keeps the suggestions", async () => {
    searchAnswers = [{ status: 200, data: { query: "zzzz", recipes: [] } }];
    renderDiscover();
    await searchFor("zzzz");

    expect(
      await screen.findByRole("heading", { name: DISCOVERY_NO_RESULTS_COPY.heading("zzzz") }),
    ).toBeInTheDocument();
    expect(screen.queryByText(DISCOVERY_EMPTY_COPY.heading)).not.toBeInTheDocument();
    for (const suggestion of DISCOVERY_SUGGESTIONS) {
      expect(screen.getByRole("button", { name: suggestion })).toBeInTheDocument();
    }
  });

  it("opens the saved recipe instead of offering Save once the result is saved", async () => {
    renderDiscover();
    await openFlan();
    await userEvent.click(await screen.findByRole("button", { name: "Save to my recipes" }));
    await userEvent.click(await screen.findByRole("button", { name: "Create recipe" }));

    await userEvent.click(await screen.findByRole("link", { name: "Back to Discover" }));
    await userEvent.click(await screen.findByRole("button", { name: new RegExp(FLAN.title) }));

    const open = await screen.findByRole("link", { name: "Open saved recipe" });
    expect(open).toHaveAttribute("href", `/recipes/${CREATED_ID}`);
    expect(screen.queryByRole("button", { name: "Save to my recipes" })).not.toBeInTheDocument();
    expect(callsTo("/discovery/detail")).toBe(1);
  });

  it("keeps the results and reads after leaving Discover and coming back", async () => {
    const first = renderDiscover();
    await openFlan();
    expect(await screen.findByRole("button", { name: "Save to my recipes" })).toBeInTheDocument();
    first.unmount();

    renderDiscover();
    expect(screen.getByLabelText("Dish to search the web for")).toHaveValue("flan");
    await userEvent.click(screen.getByRole("button", { name: new RegExp(FLAN.title) }));
    expect(await screen.findByRole("button", { name: "Save to my recipes" })).toBeInTheDocument();
    expect(callsTo("/discovery/search")).toBe(1);
    expect(callsTo("/discovery/detail")).toBe(1);
  });

  it("announces the result count in a status region", async () => {
    renderDiscover();
    await searchFor("flan");

    await waitFor(() =>
      expect(screen.getAllByRole("status").some((el) => /1 version of\s*flan, best first/.test(el.textContent ?? ""))).toBe(true),
    );
  });

  it("moves focus to each step's heading as the step changes", async () => {
    renderDiscover();
    await searchFor("flan");
    await screen.findByRole("button", { name: new RegExp(FLAN.title) });
    expect(screen.getByRole("heading", { level: 1, name: "Discover recipes" })).toHaveFocus();

    await userEvent.click(screen.getByRole("button", { name: new RegExp(FLAN.title) }));
    await screen.findByRole("button", { name: "Save to my recipes" });
    expect(screen.getByRole("heading", { level: 1, name: FLAN.title })).toHaveFocus();

    await userEvent.click(screen.getByRole("button", { name: "Back to results" }));
    expect(screen.getByRole("heading", { level: 1, name: "Discover recipes" })).toHaveFocus();
  });
});
