import type { NativeEvent } from "react-native-keyboard-controller";
import type { KeyboardHandlerEvent } from "./types/KeyboardHandlerEvent";
import type { MockKeyboard } from "./types/MockKeyboard";
import { sharedValueOf } from "./sharedValueOf";

/**
 * The keyboard the shared react-native-keyboard-controller mock reports. A test sets `progress` before rendering to
 * mount with the keyboard open, and moves the keyboard with moveMockKeyboard.
 */
export const mockKeyboard: MockKeyboard = { height: sharedValueOf(0), progress: sharedValueOf(0), handlers: new Set() };

/** Tells every mounted component's keyboard handler that the keyboard moved, as the native side would. */
export function moveMockKeyboard(event: KeyboardHandlerEvent, position: NativeEvent): void {
  for (const handler of mockKeyboard.handlers) handler[event]?.(position);
}

/** Closes the keyboard and forgets every handler; the shared setup does it before each test. */
export function resetMockKeyboard(): void {
  mockKeyboard.height.value = 0;
  mockKeyboard.progress.value = 0;
  mockKeyboard.handlers.clear();
}
