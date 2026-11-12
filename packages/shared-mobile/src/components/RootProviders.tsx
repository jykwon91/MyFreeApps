import { KeyboardProvider } from "react-native-keyboard-controller";
import type { RootProvidersProps } from "../types/RootProvidersProps";
import SessionProvider from "./SessionProvider";

/**
 * What every phone app's root layout wraps its screens in: the session, and the keyboard tracking that the
 * keyboard-aware scroll view, the header's keyboard-avoiding view and the toast read. One provider at the root
 * also covers each Modal: on Android it follows the keyboard in the Modal's own window.
 */
export default function RootProviders({ session, children }: RootProvidersProps) {
  return (
    <KeyboardProvider>
      <SessionProvider session={session}>{children}</SessionProvider>
    </KeyboardProvider>
  );
}
