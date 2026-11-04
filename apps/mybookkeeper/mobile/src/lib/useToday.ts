import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";

/** Today, kept current for a screen that stays mounted across midnight. */
export function useToday(): Date {
  const [today, setToday] = useState(() => new Date());

  const checkDate = useCallback(() => {
    const now = new Date();
    setToday((previous) => (previous.toDateString() === now.toDateString() ? previous : now));
  }, []);

  useFocusEffect(checkDate);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") checkDate();
    });
    return () => subscription.remove();
  }, [checkDate]);

  return today;
}
