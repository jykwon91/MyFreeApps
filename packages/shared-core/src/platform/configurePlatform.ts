import type { PlatformConfig } from "./types/PlatformConfig";

type ConfiguredListener = (config: PlatformConfig) => void;

let _config: PlatformConfig | null = null;
const _listeners = new Set<ConfiguredListener>();

export function configurePlatform(config: PlatformConfig): void {
  _config = config;
  // One failing listener must not leave the others unconfigured, such as the
  // API client without its baseURL. Everything runs, then the failure surfaces.
  const errors: unknown[] = [];
  _listeners.forEach((listener) => {
    try {
      listener(config);
    } catch (error) {
      errors.push(error);
    }
  });
  if (errors.length > 0) throw errors[0];
}

export function getPlatform(): PlatformConfig {
  if (!_config) {
    throw new Error(
      "@platform/core is not configured: call configurePlatform() before making a request or reading auth state.",
    );
  }
  return _config;
}

/**
 * Run `listener` with the configuration now if there is one, and again on every
 * later `configurePlatform()`, so a module works whichever loads first.
 */
export function onPlatformConfigured(listener: ConfiguredListener): void {
  _listeners.add(listener);
  if (_config) listener(_config);
}

/** Test-only: forget the configuration. Not exported from index.ts. */
export function _resetPlatformForTests(): void {
  _config = null;
}
