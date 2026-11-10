import { useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { useDevices } from "../hooks/useDevices";
import { useToast } from "../hooks/useToast";
import type { AccountSettingsProps } from "../types/AccountSettingsProps";
import AccountSection from "./AccountSection";

/** The signed-in account and its devices, fetched again each time the screen comes back into view. */
export default function AccountSettings({ appName, onDeleteAccount }: AccountSettingsProps) {
  const devices = useDevices();
  const { reload } = devices;
  const { showToast } = useToast();

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return (
    <AccountSection
      appName={appName}
      devices={devices}
      onDeleteAccount={onDeleteAccount}
      onMessage={({ message, variant }) => showToast(message, variant)}
    />
  );
}
