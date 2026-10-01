/**
 * DiscordActivityProvider + DiscordActivityGate: the website renders as
 * before; inside Discord the app waits behind "Connecting to Discord…" and a
 * failed connection offers "Try again" / "Continue anyway".
 */
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DiscordActivityGate from "../discord-activity/DiscordActivityGate";
import DiscordActivityProvider, { type DiscordActivityProviderProps } from "../discord-activity/DiscordActivityProvider";
import type { BootDiscordActivityOptions } from "../discord-activity/bootDiscordActivity";
import { DiscordActivityError } from "../discord-activity/errors/DiscordActivityError";
import type { DiscordUrlMapping } from "../discord-activity/types/DiscordUrlMapping";
import { useDiscordActivity } from "../discord-activity/useDiscordActivity";
import { LAUNCH_QUERY, loadPage } from "./discordTestUtils";

const mocks = vi.hoisted(() => ({
  boot: vi.fn<(options: BootDiscordActivityOptions) => Promise<void>>(),
}));

vi.mock("../discord-activity/bootDiscordActivity", () => ({ bootDiscordActivity: mocks.boot }));

const MAPPINGS: readonly DiscordUrlMapping[] = [{ prefix: "/clips", target: "clips.example.org" }];
const loadClientId = (): Promise<string> => Promise.resolve("123456789012345678");

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: unknown) => void;
}

function deferred(): Deferred {
  let resolve: () => void = () => undefined;
  let reject: (error: unknown) => void = () => undefined;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function StatusProbe() {
  const { inside, status, error } = useDiscordActivity();
  return <p data-testid="probe">{`${inside}:${status}:${error?.reason ?? "none"}`}</p>;
}

function renderActivity(props: Partial<Omit<DiscordActivityProviderProps, "children">> = {}) {
  return render(
    <DiscordActivityProvider loadClientId={loadClientId} urlMappings={MAPPINGS} {...props}>
      <StatusProbe />
      <DiscordActivityGate>
        <p>App content</p>
      </DiscordActivityGate>
    </DiscordActivityProvider>,
  );
}

beforeEach(() => {
  sessionStorage.clear();
  loadPage("/");
  mocks.boot.mockReset();
});

afterEach(() => {
  sessionStorage.clear();
  loadPage("/");
});

describe("on the website", () => {
  it("renders the app straight away and never touches Discord", () => {
    renderActivity();
    expect(screen.getByText("App content")).toBeInTheDocument();
    expect(screen.getByTestId("probe")).toHaveTextContent("false:ready:none");
    expect(mocks.boot).not.toHaveBeenCalled();
  });
});

describe("inside a Discord Activity", () => {
  beforeEach(() => loadPage(`/${LAUNCH_QUERY}`));

  it("shows a connecting state until Discord is ready, then the app", async () => {
    const connection = deferred();
    mocks.boot.mockReturnValue(connection.promise);
    renderActivity({ readyTimeoutMs: 5_000 });

    expect(screen.getByRole("status")).toHaveTextContent("Connecting to Discord…");
    expect(screen.queryByText("App content")).not.toBeInTheDocument();
    expect(screen.getByTestId("probe")).toHaveTextContent("true:loading:none");
    expect(mocks.boot).toHaveBeenCalledWith({ loadClientId, urlMappings: MAPPINGS, readyTimeoutMs: 5_000 });

    await act(async () => connection.resolve());

    expect(screen.getByText("App content")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByTestId("probe")).toHaveTextContent("true:ready:none");
  });

  it("explains a failed connection and retries on request", async () => {
    const user = userEvent.setup();
    const reload = vi.fn();
    mocks.boot.mockRejectedValue(new DiscordActivityError("ready-timeout", "no READY"));
    renderActivity({ reload });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Couldn't connect to Discord");
    expect(alert).toHaveTextContent("Discord didn't respond.");
    expect(screen.queryByText("App content")).not.toBeInTheDocument();
    expect(screen.getByTestId("probe")).toHaveTextContent("true:error:ready-timeout");

    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("lets the user continue without the connection", async () => {
    const user = userEvent.setup();
    mocks.boot.mockRejectedValue(new DiscordActivityError("closed-by-discord", "closed", { code: 4000 }));
    renderActivity();

    await user.click(await screen.findByRole("button", { name: "Continue anyway" }));

    expect(screen.getByText("App content")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByTestId("probe")).toHaveTextContent("true:error:closed-by-discord");
  });

  it("treats an unexpected failure as an SDK start-up failure", async () => {
    mocks.boot.mockRejectedValue(new Error("boom"));
    renderActivity();
    expect(await screen.findByRole("alert")).toHaveTextContent("in a way this app doesn't understand");
    expect(screen.getByTestId("probe")).toHaveTextContent("true:error:sdk-init-failed");
  });
});

describe("useDiscordActivity", () => {
  it("explains a missing provider", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => render(<StatusProbe />)).toThrow("useDiscordActivity() must be used inside <DiscordActivityProvider>.");
    vi.restoreAllMocks();
  });
});
