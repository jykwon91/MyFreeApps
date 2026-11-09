import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";

/** True while this screen is the one showing, so background work can pause when it isn't. */
export function useScreenFocused(): boolean {
  const [isFocused, setIsFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      return () => setIsFocused(false);
    }, []),
  );
  return isFocused;
}
