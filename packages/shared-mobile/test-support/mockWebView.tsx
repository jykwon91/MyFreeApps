import { useEffect } from "react";
import { View, type ViewProps } from "react-native";

/** How many WebViews have mounted, so a test can tell a reset (a new one) from a re-render. */
export const webViewMounts = { count: 0 };

/**
 * react-native-webview for Jest, where its native module doesn't exist: a View carrying every prop, found by the
 * test ID "webview", so a test can read `source` and call `onMessage` or `onShouldStartLoadWithRequest`. Use with
 * jest/webview.js, which a Jest config lists in setupFiles.
 */
export default function MockWebView(props: ViewProps) {
  useEffect(() => {
    webViewMounts.count += 1;
  }, []);
  return <View {...props} testID="webview" />;
}
