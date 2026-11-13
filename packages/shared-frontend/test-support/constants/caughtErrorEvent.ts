import type { CAUGHT_ERROR_EVENT } from "../../src/constants/caught-error-event";

/**
 * The event name @platform/ui's error boundaries announce a caught crash on.
 * Spelled out rather than imported because src/ loads as CommonJS under Node
 * (see mockSession.ts), so a runtime import from it fails; the type annotation
 * makes typecheck:test-support fail if the two ever differ.
 */
export const CAUGHT_ERROR_EVENT_NAME: typeof CAUGHT_ERROR_EVENT = "platform:caught-error";
