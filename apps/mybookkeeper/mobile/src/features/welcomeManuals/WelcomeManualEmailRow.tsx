import { router } from "expo-router";
import { WELCOME_MANUAL_MESSAGES as MESSAGES } from "../../constants/welcomeManuals";
import WelcomeManualNavRow from "./WelcomeManualNavRow";

interface WelcomeManualEmailRowProps {
  /** The manual's route, like "/welcome-manuals/<id>". */
  base: string;
  /** A manual with no sections has nothing to email, so the row is locked and says why. */
  hasSections: boolean;
}

export default function WelcomeManualEmailRow({ base, hasSections }: WelcomeManualEmailRowProps) {
  const value = hasSections ? undefined : MESSAGES.noEmailWithoutSections;
  return (
    <WelcomeManualNavRow disabled={!hasSections} label={MESSAGES.emailRow} onPress={() => router.push(`${base}/email`)} value={value} />
  );
}
