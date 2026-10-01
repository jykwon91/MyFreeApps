/**
 * Helpers for the src/discord-activity tests: load the page the way Discord
 * launches an Activity, and play Discord's side of the Embedded App SDK's
 * postMessage RPC against the REAL SDK.
 */
import * as embeddedAppSdk from "@discord/embedded-app-sdk";
import { expect, vi, type Mock } from "vitest";
import { DiscordActivityError } from "../discord-activity/errors/DiscordActivityError";
import { __resetDiscordLaunchForTests } from "../discord-activity/launchParams";
import type { DiscordSdkClient, EmbeddedAppSdkModule } from "../discord-activity/loadEmbeddedAppSdk";

/** The query string Discord launches an Activity with. */
export const LAUNCH_QUERY = "?frame_id=frame-1&instance_id=instance-1&platform=desktop";

// An origin the SDK accepts RPC messages from.
const DISCORD_ORIGIN = "https://discord.com";

/** A fresh page load at `url`: the cached inside/outside-Discord answer is dropped. */
export function loadPage(url: string): void {
  window.history.replaceState(null, "", url);
  __resetDiscordLaunchForTests();
}

/** Discord's READY dispatch — its answer to the SDK's handshake. */
export const READY_FRAME = [
  1,
  {
    cmd: "DISPATCH",
    evt: "READY",
    nonce: null,
    data: { v: 1, config: { api_endpoint: "//discord.com/api", environment: "production" } },
  },
];

/** Discord closing the RPC connection, e.g. code 4000 for an unknown client id. */
export function closeFrame(code: number, message: string): unknown[] {
  return [2, { code, message }];
}

/** Deliver an RPC frame to the Activity as Discord's client does — from the parent frame by default. */
export function postFromDiscord(data: unknown, source: MessageEventSource | null = window): void {
  window.dispatchEvent(new MessageEvent("message", { data, origin: DISCORD_ORIGIN, source }));
}

export interface TrackedSdk {
  /** Inject as `deps.loadSdk`: the real SDK, with `patchUrlMappings` swapped for a spy. */
  load: () => Promise<EmbeddedAppSdkModule>;
  /** Every SDK client constructed, in order. */
  clients: DiscordSdkClient[];
  /** "patch" / "construct", in call order. */
  events: string[];
  patchUrlMappings: Mock<EmbeddedAppSdkModule["patchUrlMappings"]>;
  /** Close every client so no SDK message listener outlives its test. */
  teardown: () => void;
}

export function trackedSdk(): TrackedSdk {
  const clients: DiscordSdkClient[] = [];
  const events: string[] = [];

  class TrackedDiscordSDK extends embeddedAppSdk.DiscordSDK {
    constructor(...args: ConstructorParameters<typeof embeddedAppSdk.DiscordSDK>) {
      events.push("construct");
      super(...args);
      clients.push(this);
    }
  }

  // A spy, not the real thing: the real patchUrlMappings rewrites this test
  // process's fetch / XHR / WebSocket for every test that runs after it.
  const patchUrlMappings = vi.fn<EmbeddedAppSdkModule["patchUrlMappings"]>(() => {
    events.push("patch");
  });
  const module: EmbeddedAppSdkModule = { ...embeddedAppSdk, DiscordSDK: TrackedDiscordSDK, patchUrlMappings };

  return {
    load: () => Promise.resolve(module),
    clients,
    events,
    patchUrlMappings,
    teardown: () => {
      for (const client of clients) client.close(embeddedAppSdk.RPCCloseCodes.CLOSE_NORMAL, "test finished");
    },
  };
}

/** Wait until the code under test has constructed its SDK client. */
export function constructedClient(sdk: TrackedSdk): Promise<DiscordSdkClient> {
  return vi.waitFor(() => {
    const [client] = sdk.clients;
    if (client === undefined) throw new Error("no Discord SDK client constructed yet");
    return client;
  });
}

const CONSOLE_METHODS = ["log", "warn", "debug", "info", "error"] as const;

/**
 * Once READY arrives the real SDK wraps console.* to forward logs to
 * Discord. Call before a test; call the returned function after it.
 */
export function preserveConsole(): () => void {
  const saved = CONSOLE_METHODS.map((method) => [method, console[method]] as const);
  return () => {
    for (const [method, original] of saved) console[method] = original;
  };
}

/** The DiscordActivityError `promise` rejects with (fails the test if it resolves). */
export async function rejection(promise: Promise<unknown>): Promise<DiscordActivityError> {
  const error = await promise.then(
    () => {
      throw new Error("expected the promise to reject");
    },
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(DiscordActivityError);
  if (!(error instanceof DiscordActivityError)) throw error;
  return error;
}
