import type * as EmbeddedAppSdk from "@discord/embedded-app-sdk";

/** The `@discord/embedded-app-sdk` module namespace. */
export type EmbeddedAppSdkModule = typeof EmbeddedAppSdk;

/** A constructed `DiscordSDK` client. */
export type DiscordSdkClient = InstanceType<EmbeddedAppSdkModule["DiscordSDK"]>;

let sdkModule: Promise<EmbeddedAppSdkModule> | null = null;

/**
 * Load the Discord Embedded App SDK on demand.
 *
 * This dynamic `import()` is the ONLY place the SDK is referenced as a value,
 * so bundlers split it into its own chunk that is fetched only inside a
 * Discord Activity — the normal website never downloads it, and apps that
 * never call this never bundle it. Keep every other SDK reference type-only.
 * A failed load is not cached, so a later call can retry.
 */
export function loadEmbeddedAppSdk(): Promise<EmbeddedAppSdkModule> {
  if (sdkModule === null) {
    sdkModule = import("@discord/embedded-app-sdk").catch((error: unknown) => {
      sdkModule = null;
      throw error;
    });
  }
  return sdkModule;
}
