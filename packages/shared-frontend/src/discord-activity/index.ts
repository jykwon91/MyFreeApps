// @platform/ui/discord-activity — run an app as a Discord Activity (opt-in).
//
//   import { DiscordActivityProvider, isDiscordActivity } from "@platform/ui/discord-activity";
//
// Import from this subpath only. It is deliberately NOT re-exported from the
// package root, and the Embedded App SDK is referenced as a value in exactly
// one place — the dynamic import() in loadEmbeddedAppSdk() — so apps that
// don't use this never bundle the SDK and the website never downloads it.
// Keep every other SDK reference type-only.

export {
  DISCORD_LAUNCH_PARAMS,
  getDiscordLaunchSearch,
  isDiscordActivity,
  withoutDiscordLaunchParams,
} from "./launchParams";
export {
  DISCORD_READY_TIMEOUT_MS,
  DISCORD_SDK_LOAD_TIMEOUT_MS,
  getDiscordSdk,
  initDiscordActivity,
} from "./initDiscordActivity";
export type { InitDiscordActivityOptions } from "./initDiscordActivity";
export type { DiscordSdkClient } from "./loadEmbeddedAppSdk";
export { installDiscordUrlRemap, remapUrlsDeep } from "./urlRemap";
export { DISCORD_ACTIVITY_CONFIG_PATH, loadDiscordActivityClientId } from "./loadDiscordActivityClientId";
export { openExternal } from "./openExternal";
export { buildSiteUrl } from "./buildSiteUrl";
export type { SiteLocation } from "./buildSiteUrl";
export { useDiscordActivity } from "./useDiscordActivity";
export { default as DiscordActivityProvider } from "./DiscordActivityProvider";
export type { DiscordActivityProviderProps } from "./DiscordActivityProvider";
export { default as DiscordActivityGate } from "./DiscordActivityGate";
export type { DiscordActivityGateProps } from "./DiscordActivityGate";
export { default as OutboundLink } from "./OutboundLink";
export type { OutboundLinkProps } from "./OutboundLink";
export { DiscordActivityError } from "./errors/DiscordActivityError";
export type { DiscordActivityConfig } from "./types/DiscordActivityConfig";
export type { DiscordActivityErrorReason } from "./types/DiscordActivityErrorReason";
export type { DiscordActivityState } from "./types/DiscordActivityState";
export type { DiscordActivityStatus } from "./types/DiscordActivityStatus";
export type { DiscordUrlMapping } from "./types/DiscordUrlMapping";
