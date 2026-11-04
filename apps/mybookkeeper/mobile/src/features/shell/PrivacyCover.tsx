import { useTheme } from "@platform/mobile";
import { useEffect, useState } from "react";
import { AppState, View } from "react-native";

/**
 * Best effort at hiding tenants' messages and contact details from the iPhone app
 * switcher. It can't cover an open sheet, and Android's recents thumbnail is out of its reach.
 */
export default function PrivacyCover() {
  const { colors } = useTheme();
  const [isCovered, setIsCovered] = useState(AppState.currentState !== "active");

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => setIsCovered(state !== "active"));
    return () => subscription.remove();
  }, []);

  if (!isCovered) return null;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.background }}
      testID="privacy-cover"
    />
  );
}
