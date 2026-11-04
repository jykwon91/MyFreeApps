import { type AccountMessage, AccountSection, useDevices } from "@platform/mobile";
import { useFocusEffect } from "expo-router";
import { useCallback } from "react";

export default function SignedInSettings({ onMessage }: { onMessage: (message: AccountMessage) => void }) {
  const devices = useDevices();
  const { reload } = devices;

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return <AccountSection appName="MyRecipes" devices={devices} onMessage={onMessage} />;
}
