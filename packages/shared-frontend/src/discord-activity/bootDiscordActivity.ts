import type { DiscordUrlMapping } from "./types/DiscordUrlMapping";
import { DiscordActivityError } from "./errors/DiscordActivityError";
import { toDiscordActivityError } from "./errors/toDiscordActivityError";
import { initDiscordActivity, type InitDiscordActivityDeps } from "./initDiscordActivity";
import { loadEmbeddedAppSdk } from "./loadEmbeddedAppSdk";
import { withTimeout } from "./withTimeout";

/** How long fetching the application id may take before the error screen shows. */
export const DISCORD_CLIENT_ID_TIMEOUT_MS = 10_000;

export interface BootDiscordActivityOptions {
  /** Resolves the Discord application (client) id, e.g. from a public config endpoint. */
  loadClientId: () => Promise<string>;
  urlMappings: readonly DiscordUrlMapping[];
  readyTimeoutMs?: number;
}

const DEFAULT_DEPS: InitDiscordActivityDeps = { loadSdk: loadEmbeddedAppSdk };

let boot: Promise<void> | null = null;

async function loadClientIdOrFail(loadClientId: () => Promise<string>): Promise<string> {
  let clientId: string;
  try {
    const loading = withTimeout(loadClientId(), DISCORD_CLIENT_ID_TIMEOUT_MS, "Fetching the Discord application id");
    clientId = (await loading).trim();
  } catch (cause) {
    throw new DiscordActivityError("client-id-unavailable", "Couldn't load the Discord application id.", { cause });
  }
  if (clientId === "") {
    throw new DiscordActivityError("client-id-unavailable", "The Discord application id is empty.");
  }
  return clientId;
}

async function run(options: BootDiscordActivityOptions, deps: InitDiscordActivityDeps): Promise<void> {
  // Fetch the SDK chunk while the client id loads. A failure here is not
  // lost: the loader doesn't cache it, so initDiscordActivity's own load
  // retries and reports it.
  void deps.loadSdk().catch(() => undefined);
  try {
    const clientId = await loadClientIdOrFail(options.loadClientId);
    await initDiscordActivity({ clientId, urlMappings: options.urlMappings, readyTimeoutMs: options.readyTimeoutMs }, deps);
  } catch (error) {
    const failure = toDiscordActivityError(error);
    console.warn(
      "[discord-activity] couldn't connect to Discord: reason=%s code=%s message=%s",
      failure.reason,
      failure.code ?? "none",
      failure.message,
      failure.cause,
    );
    throw failure;
  }
}

/**
 * Connect this page to Discord: fetch the application id, then
 * {@link initDiscordActivity}. Every step is time-bounded, so the attempt
 * always settles — "Connecting to Discord…" ends in the app or the error
 * screen. One attempt per page — React StrictMode's doubled effects share it —
 * and a failure is logged with its reason and Discord's code before it rejects.
 */
export function bootDiscordActivity(
  options: BootDiscordActivityOptions,
  deps: InitDiscordActivityDeps = DEFAULT_DEPS,
): Promise<void> {
  if (boot === null) boot = run(options, deps);
  return boot;
}

/** Forget the page's attempt so each test starts fresh. */
export function __resetDiscordBootForTests(): void {
  boot = null;
}
