import type { DiscordUrlMapping } from "./types/DiscordUrlMapping";
import { DiscordActivityError } from "./errors/DiscordActivityError";
import { getDiscordLaunchSearch } from "./launchParams";
import {
  loadEmbeddedAppSdk,
  type DiscordSdkClient,
  type EmbeddedAppSdkModule,
} from "./loadEmbeddedAppSdk";
import { withTimeout } from "./withTimeout";

/** How long the SDK chunk may take to download before the error screen shows. */
export const DISCORD_SDK_LOAD_TIMEOUT_MS = 15_000;

/** How long to wait for Discord's READY before showing the error screen. */
export const DISCORD_READY_TIMEOUT_MS = 10_000;

// Discord RPC opcode for "connection closed" — `[2, { code, message }]`. The
// SDK ignores it during the handshake (ready() would just never resolve), so
// it is watched here to fail fast with Discord's close code.
const RPC_CLOSE_OPCODE = 2;

export interface InitDiscordActivityOptions {
  /** The Discord application (client) id. */
  clientId: string;
  /** URL Mappings (identical to the Developer Portal's) to patch fetch / XHR / WebSocket with. */
  urlMappings: readonly DiscordUrlMapping[];
  /** Defaults to {@link DISCORD_READY_TIMEOUT_MS}. */
  readyTimeoutMs?: number;
}

export interface InitDiscordActivityDeps {
  loadSdk: () => Promise<EmbeddedAppSdkModule>;
}

const DEFAULT_DEPS: InitDiscordActivityDeps = { loadSdk: loadEmbeddedAppSdk };

let initialization: Promise<DiscordSdkClient> | null = null;
let readyClient: DiscordSdkClient | null = null;

/** The connected SDK client, or `null` until Discord is READY (and always outside Discord). */
export function getDiscordSdk(): DiscordSdkClient | null {
  return readyClient;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function createClient(sdk: EmbeddedAppSdkModule, clientId: string, launchSearch: string): DiscordSdkClient {
  // The SDK reads frame_id / instance_id / platform from `_getSearch()`, which
  // defaults to window.location.search — empty after a reload on a deep link.
  // Feed it the launch parameters kept for the session instead.
  class LaunchParamsDiscordSdk extends sdk.DiscordSDK {
    override _getSearch(): string {
      return launchSearch;
    }
  }
  return new LaunchParamsDiscordSdk(clientId);
}

function parseClose(data: unknown): { code: number; message: string } | null {
  if (!Array.isArray(data) || data[0] !== RPC_CLOSE_OPCODE) return null;
  const payload: unknown = data[1];
  if (typeof payload !== "object" || payload === null) return null;
  if (!("code" in payload) || typeof payload.code !== "number") return null;
  const message = "message" in payload && typeof payload.message === "string" ? payload.message : "";
  return { code: payload.code, message };
}

function closedByDiscord(close: { code: number; message: string }): DiscordActivityError {
  const detail = close.message ? `${close.code}: ${close.message}` : String(close.code);
  return new DiscordActivityError("closed-by-discord", `Discord closed the connection (code ${detail}).`, {
    code: close.code,
  });
}

function waitUntilReady(client: DiscordSdkClient, timeoutMs: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new DiscordActivityError("ready-timeout", `Discord didn't finish the handshake within ${timeoutMs} ms.`));
    }, timeoutMs);
    window.addEventListener("message", onMessage);
    void client.ready().then(() => {
      cleanup();
      resolve();
    });

    function onMessage(event: MessageEvent): void {
      // Only the frame the SDK talks to (Discord's RPC host) can close it.
      if (event.source !== client.source) return;
      const close = parseClose(event.data);
      if (close === null) return;
      cleanup();
      reject(closedByDiscord(close));
    }

    function cleanup(): void {
      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
    }
  });
}

async function connect(options: InitDiscordActivityOptions, deps: InitDiscordActivityDeps): Promise<DiscordSdkClient> {
  const launchSearch = getDiscordLaunchSearch();
  if (launchSearch === null) {
    throw new DiscordActivityError("not-in-discord", "Not running as a Discord Activity (no frame_id launch parameter).");
  }

  let sdk: EmbeddedAppSdkModule;
  try {
    sdk = await withTimeout(deps.loadSdk(), DISCORD_SDK_LOAD_TIMEOUT_MS, "Downloading the Embedded App SDK");
  } catch (cause) {
    throw new DiscordActivityError("sdk-load-failed", `The Discord Embedded App SDK didn't load: ${errorMessage(cause)}`, {
      cause,
    });
  }

  // Patch BEFORE the handshake: if Discord never answers and the user
  // continues anyway, requests to mapped hosts still go through the proxy.
  if (options.urlMappings.length > 0) {
    sdk.patchUrlMappings(options.urlMappings.map(({ prefix, target }) => ({ prefix, target })));
  }

  let client: DiscordSdkClient;
  try {
    client = createClient(sdk, options.clientId, launchSearch);
  } catch (cause) {
    throw new DiscordActivityError(
      "sdk-init-failed",
      `The Discord Embedded App SDK rejected the launch parameters: ${errorMessage(cause)}`,
      { cause },
    );
  }

  // A READY that arrives after the timeout still connects the SDK, so
  // "Continue anyway" regains openExternalLink once Discord catches up.
  void client.ready().then(() => {
    readyClient = client;
  });

  await waitUntilReady(client, options.readyTimeoutMs ?? DISCORD_READY_TIMEOUT_MS);
  readyClient = client;
  return client;
}

/**
 * Connect to Discord as an Activity: load the Embedded App SDK (dynamic
 * import — never in the website's bundle path), patch the URL Mappings,
 * construct the SDK and wait for READY. The download and the READY wait are
 * both time-bounded, so this always settles.
 *
 * One connection per page: later calls return the first call's promise. It
 * rejects with a {@link DiscordActivityError} saying which step failed; a
 * retry is a page reload.
 */
export function initDiscordActivity(
  options: InitDiscordActivityOptions,
  deps: InitDiscordActivityDeps = DEFAULT_DEPS,
): Promise<DiscordSdkClient> {
  if (initialization === null) initialization = connect(options, deps);
  return initialization;
}

/** Forget the page's connection so each test starts fresh. */
export function __resetDiscordActivityForTests(): void {
  initialization = null;
  readyClient = null;
}
