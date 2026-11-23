/**
 * Photo import keeps the photo for another try when the failure isn't the photo's fault, drops it
 * when it is, and says the truth about leaving: leaving mid-read asks first, then cancels the request.
 */
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AxiosAdapter, GenericAbortSignal, InternalAxiosRequestConfig } from "axios";
import { Provider } from "react-redux";
import { Link, RouterProvider, createMemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { baseApi } from "@platform/ui";
import { PHOTO_IMPORT_COPY, PHOTO_IMPORT_STOP_COPY } from "@myrecipes/api-client/constants/photoImport";
import api from "@/lib/api";
import { makeStore, type AppStore } from "@/lib/store";
import RecipeImport from "@/pages/RecipeImport";

vi.mock("@/utils/downscalePhoto", () => ({ downscalePhoto: vi.fn((file: File) => Promise.resolve(file)) }));

const PHOTO = new File(["x"], "card.png", { type: "image/png" });
const PREVIEW = `Preview of ${PHOTO.name}`;

let store: AppStore;
let statuses: number[];
let sentSignals: GenericAbortSignal[];
let hangForever: boolean;
const originalAdapter = api.defaults.adapter;

const adapter: AxiosAdapter = (config: InternalAxiosRequestConfig) => {
  if (config.signal) sentSignals.push(config.signal);
  if (hangForever) return new Promise(() => undefined);
  const status = statuses.shift() ?? 500;
  if (status >= 400) {
    return Promise.reject(Object.assign(new Error("failed"), { response: { status, data: {} }, config, isAxiosError: true }));
  }
  return Promise.resolve({ status, data: {}, statusText: "", headers: {}, config });
};

function renderImport() {
  const router = createMemoryRouter(
    [
      {
        path: "/recipes/import",
        element: (
          <>
            <RecipeImport />
            <Link to="/elsewhere">Go elsewhere</Link>
          </>
        ),
      },
      { path: "/elsewhere", element: <p>Elsewhere</p> },
    ],
    { initialEntries: ["/recipes/import"] },
  );
  return render(
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>,
  );
}

async function pickAndExtract() {
  await userEvent.upload(document.querySelector('input[type="file"]') as HTMLInputElement, PHOTO);
  await userEvent.click(await screen.findByRole("button", { name: "Extract recipe" }));
}

beforeEach(() => {
  store = makeStore();
  statuses = [];
  sentSignals = [];
  hangForever = false;
  api.defaults.adapter = adapter;
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  act(() => {
    store.dispatch(baseApi.util.resetApiState());
  });
  api.defaults.adapter = originalAdapter;
});

describe("RecipeImport", () => {
  it.each([429, 503, 500])("keeps the photo for another try after a %i", async (status) => {
    statuses = [status];
    renderImport();
    await pickAndExtract();

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByAltText(PREVIEW)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Extract recipe" })).toBeEnabled();
  });

  it.each([413, 415, 422])("clears the photo after a %i, because the photo is the problem", async (status) => {
    statuses = [status];
    renderImport();
    await pickAndExtract();

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByAltText(PREVIEW)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Extract recipe" })).not.toBeInTheDocument();
  });

  it("says leaving cancels the import, and asks before leaving, then cancels the request", async () => {
    hangForever = true;
    renderImport();
    await pickAndExtract();

    expect(await screen.findByText(PHOTO_IMPORT_COPY.leavingCancels)).toBeInTheDocument();
    await waitFor(() => expect(sentSignals).toHaveLength(1));
    expect(sentSignals[0].aborted).toBe(false);

    await userEvent.click(screen.getByRole("link", { name: "Go elsewhere" }));
    expect(await screen.findByText(PHOTO_IMPORT_STOP_COPY.discardTitle)).toBeInTheDocument();
    expect(sentSignals[0].aborted).toBe(false);

    await userEvent.click(screen.getByRole("button", { name: PHOTO_IMPORT_STOP_COPY.keepEditing }));
    expect(screen.queryByText(PHOTO_IMPORT_STOP_COPY.discardTitle)).not.toBeInTheDocument();
    expect(screen.getByText(PHOTO_IMPORT_COPY.reading)).toBeInTheDocument();
    expect(sentSignals[0].aborted).toBe(false);

    await userEvent.click(screen.getByRole("link", { name: "Go elsewhere" }));
    await userEvent.click(await screen.findByRole("button", { name: PHOTO_IMPORT_STOP_COPY.discard }));

    expect(await screen.findByText("Elsewhere")).toBeInTheDocument();
    expect(sentSignals[0].aborted).toBe(true);
  });
});
